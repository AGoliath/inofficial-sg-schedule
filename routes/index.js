const express = require('express');
const router = express.Router();
const Datastore = require('nedb')
    , db = new Datastore({filename: 'matches.dbe', autoload: true});
const axios = require("axios");
const parser = require('node-html-parser');
const parse = parser.parse;
const url = "http://speedgaming.org/de/?showid";
const cleanString = (ins) => {
    let rawTxt = ins.trim();
    rawTxt = rawTxt.split("\t").join(" ");
    rawTxt = rawTxt.split("\n").join(" ");
    while (rawTxt.indexOf("  ") > -1) rawTxt = rawTxt.split("  ").join(" ");
    return rawTxt.trim();
};


setInterval(() => {
        axios.get("https://inofficial-sg-schedule.herokuapp.com/update");
    },
    1000 * 60 * 10
);

const formatDate = (d) => {
    const tag = d.getDate();
    const monat = d.getMonth() + 1;
    const jahr = d.getFullYear();
    const stunde = d.getHours();
    const minute = d.getMinutes();
    const sekunde = d.getSeconds();
    const millisek = d.getMilliseconds();
    return tag + "." + monat + "." + jahr + " " + stunde + ":" + minute + ":" + sekunde + "." + millisek;
}


let lastSync = new Date();


let BOs = {};
["nobody_yet", "aLinkFromThisWorld", "catobat", "Taale", "Tairr", "someone_else"].forEach((bo) => {
    BOs[bo] = bo;
});


const BO_KEY = "Broadcast Op";
const ANMERKUNG_KEY = "Anmerkung";

const getData = async url => {
    try {
        lastSync = new Date();
        const response = await axios.get(url);
        const data = response.data;
        const p = parse(data);
        const matchRows = p.querySelector('table').querySelectorAll('tr');
        const headers = {};
        matchRows[0].childNodes.forEach((cn, ind) => {
            if (cn.tagName !== "td" || !cn.childNodes || cn.childNodes.length < 1 || !cn.childNodes[0].rawText) return;
            let rawTxt = cleanString(cn.childNodes[0].rawText);
            if (rawTxt) {
                headers[rawTxt] = ind;
            }
        });
        matchRows.forEach((row, ind) => {
            if (ind === 0) return;

            let match = {
                _id: cleanString(row.childNodes[headers["ID"]].childNodes[0].rawText)
            };
            if (!match._id) return;
            Object.keys(headers).forEach((headerName) => {
                if (headerName === "ID" || !row.childNodes[headers[headerName]]) return;
                match[headerName] = cleanString(row.childNodes[headers[headerName]].innerHTML);
            });
            db.find({_id: match._id}, function (err, docs) {
                if (docs[0]) {
                    Object.keys(docs[0]).forEach((dbKey) => {
                        if (dbKey === "_id") return;
                        if (match[dbKey]) match[dbKey] = docs[0][dbKey];
                    });
                    match = docs[0];
                } else {

                    match[BO_KEY] = Object.keys(BOs)[0];
                    match[ANMERKUNG_KEY] = "";
                }
                db.update({_id: match._id}, match, {upsert: true}, function (err, numReplaced, upsert) {
                    if (!err) console.log("wrote " + match._id);
                    else throw new Error(err)
                });

            });
        });
        return JSON.stringify(data);
    } catch (error) {
        console.log(error);
    }
};

async function getTable() {
    let out = "";
    let ou = new Promise(((resolve, reject) => {
        db.find({}, function (err, docs) {
            docs.forEach((doc) => {
                if (out === "") {
                    out = "<table><tr>";
                    Object.keys(doc).forEach((header) => {
                        out += `<th>${header}</th>`;
                    });
                    out += '</tr>'
                }
                out += "<tr>";
                Object.keys(doc).forEach((header) => {
                    if (header === BO_KEY) {

                        out += `<td><b>${doc[header]}</b><br />`;
                        Object.keys(BOs).forEach((bo) => {
                            out += `<br /><a href="/match/${doc._id}/bo/${bo}?cachebust=${Math.floor(Math.random() * 10000)}">${bo}</a>`;
                        })
                    } else {
                        out += `<td>${doc[header]}`;

                    }
                    out += `</td>`;
                });
                out += '</tr>'

            });
            out += "</table>";
            resolve(out);
        });
    }));

    return ou;
}


async function getRaw() {
    let ou = new Promise(((resolve, reject) => {
        db.find({}, function (err, docs) {
            resolve(docs);
        });
    }));

    return ou;
}

/* GET home page. */
router.get('/', async function (req, res, next) {
    const bd = await getTable();
    res.render('index', {title: 'inofficial SGDE Schedule', body: bd, syncDate: formatDate(lastSync)});
});
router.get('/update', async function (req, res, next) {
    await getData(url);
    res.redirect(`/?cachebust=${Math.floor(Math.random() * 10000)}`);
});
router.get('/raw', async function (req, res, next) {

    res.json(await getRaw())
});
router.get('/match/:matchid/bo/:bo', function (req, res) {
    if (!BOs[req.params.bo]) {
        res.status(404).send("Bad BO");
        return;
    }
    db.find({_id: req.params.matchid}, function (err, docs) {
        if (err || docs.length !== 1) {
            res.status(404).send("Bad match");
            return;
        }
        db.update({_id: docs[0]._id}, {$set: {[BO_KEY]: req.params.bo}}, {}, function (err, numReplaced, upsert) {
            if (err) {
                res.status(500).send("Update failed");
                return;
            }
            res.redirect(`/?cachebust=${Math.floor(Math.random() * 10000)}`);
        });

    })
});

module.exports = router;
