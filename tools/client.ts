///<reference path='../typings/node/node.d.ts'/>
///<reference path='../rt/typings.d.ts'/>
///<reference path='../build/jsonapi.d.ts'/>

import fs = require('fs');
import os = require('os');
import url = require('url');
import util = require('util');
import http = require('http');
import https = require('https');
import path = require('path');
import child_process = require('child_process');
import crypto = require("crypto")

var scriptsWithErrors = ["isrt", "bvxv", "cgcbb", "bkiza", "urde",
  "oasy", "faxz", // tap wall RECORD is missing in webapp
  // concat on record field without ->get
  // "ejhva", "muvr", "vhiz",
  // more errors
  "asct", "rzmfa", "xcjj", "awska", "btkz", "khtv", "hcts", "vvju", /* "cqbba" unasigned return value not failing anymore */
  "uetu", "xyzx", "wqcxa", "laogsfab", "crlf", "uoji","xuom",
  "oixe", "ifsqb",
  // async errors
  "osro", "opcx", "vovva", "xuznb", "snns",
  // tutorial
  "arxpa"
];

var localUrl = "http://localhost:80/";

var afterParse = () => {};
var numErrors = 0;
var reqNo = 0

http.globalAgent.maxSockets = 15;
https.globalAgent.maxSockets = 15;

function readRes(g, f) {
    var bufs = []
    g.on('data', (c) => {
        if (typeof c === "string")
            bufs.push(new Buffer(c, "utf8"))
        else
            bufs.push(c)
    });

    g.on('end', () => {
        var total = Buffer.concat(bufs)
        f(total)
    })
}

function tdevGet(uri:string, f:(a:string)=>void, numRetries = 5, body = null, contentType = null)
{
    var currReq = reqNo++;
    var isDone = false

    function finish(d:string) {
        if (!isDone) {
            isDone = true;
            f(d)
        }
    }

    var safeuri = uri.replace(/access_token.*/, "[snip]")

    // console.log("GET " + safeuri + " " + reqNo)
    var handle = (res:http.ClientResponse) => {
        if (res.statusCode != 200) {
            console.error("%s: OOPS, status %d for %s", new Date()+"", res.statusCode, safeuri);
            if ((res.statusCode == 424 || res.statusCode == 500) && /(import\/|admin\/reindex)/.test(uri) && numRetries > 0) {
                tdevGet(uri, f, numRetries - 1, body, contentType)
                return
            }
            numErrors++;
            finish(null);
        }

        res.setEncoding('utf-8');

        var d = "";
        res.on("error", (err) => {
            console.log("res error")
            console.log(err)
            finish(null)
        })
        res.on("data", (ch) => { d += ch; });
        res.on("end", () => {
            if (res.statusCode == 200)
                finish(d)
            else console.log(d)
        });
    }

    var purl:any = /^http(s?):/.test(uri) ? url.parse(uri) : { hostname: 'www.touchdevelop.com', path: '/api/' + uri }
    purl.method = body ? 'PUT' : 'GET'
    var bd = body
    if (body && !Buffer.isBuffer(body) && typeof body == "object") {
        bd = JSON.stringify(body)
        purl.method = "POST"
        purl.headers = { 'content-type': 'application/json; charset=utf8' }
    }
    if (contentType) {
        purl.headers = { 'content-type': contentType }
        if (/urlencoded|multipart/.test(contentType))
            purl.method = 'POST'
    }
    if (!/^http:/.test(uri)) {
        var req = https.request(purl, handle);
    } else {
        var req = http.request(purl, handle);
    }

    req.on("error", (err) => {
        if (!isDone && numRetries > 0 && err.code == 'ECONNRESET') {
            console.log(new Date() + ": conn reset, retry " + safeuri)
            isDone = true
            tdevGet(uri, f, numRetries - 1, body, contentType)
        } else {
            console.error(new Date() + " req error " + safeuri + " " + util.inspect(err))
            finish(null)
        }
    })

    if (bd)
        req.end(bd);
    else
        req.end();
}

function getArt(uri:string, f:()=>void)
{
    var handle = (res:http.ClientResponse) => {
        if (res.statusCode != 200) {
            console.error("OOPS, status %d for %s", res.statusCode, uri);
            numErrors++;
            return;
        }

        var ext = ""
        switch (res.headers['content-type']) {
            case "image/jpeg": ext = ".jpg"; break;
            case "image/png": ext = ".png"; break;
            case "audio/wav": ext = ".wav"; break;
            default: ext = "." + res.headers['content-type'].replace(/[^a-z]/g, "_")
                break;
        }

        var mm = /.*\/(.*)$/.exec(uri);
        var basename = uri
        if (mm) basename = mm[1]
        basename = basename.replace(/[^a-z0-9A-Z]/g, "_")

        var path = "help-images/" + basename + ext
        var file = fs.createWriteStream(path)

        var d = "";
        var len = 0
        res.on("data", (ch) => {
            file.write(ch)
            len += ch.length
        })
        res.on("end", () => {
            (<any>file).end(() => {
                // console.log("written " + path + " (" + len + " bytes)")
                f()
            })
        });
    }

    var purl:any = url.parse(uri);
    purl.method = 'GET'
    if (/^https/.test(uri)) {
        var req = https.request(purl, handle);
        req.end();
    } else {
        var req = http.request(purl, handle);
        req.end();
    }
}

function post(u:string, arg:any, f:(a:any)=>void)
{
    var p = url.parse(localUrl);
    var req = (p.protocol == "https:" ? <any>https : http).request({
        hostname: p.hostname,
        port: p.port,
        method: arg ? 'POST' : 'GET',
        path: u ? '/api/' + u : '/api',
        headers: {
            "content-type": "application/json"
        },
    }, (res) => {
        if (res.statusCode != 200) {
            console.error("OOPS, status %d", res.statusCode);
            numErrors++;
            f(null)
            return;
        }

        res.setEncoding('utf-8');

        var d = "";
        res.on("data", (ch) => { d += ch; });
        res.on("end", () => {
            if (/json/i.test(res.headers['content-type']))
                f(JSON.parse(d))
            else
                f(d)
        });
    });
    req.on("error", (err) => {
        console.error("bad response: " + err)
        numErrors++
        f(null)
    });
    if (arg)
        req.end(JSON.stringify(arg), "utf-8");
    else
        req.end();
}

export function deps(args:string[])
{
    args.forEach((arg) => {
        var req = <TDev.DepsRequest> { script: fs.readFileSync(arg, "utf-8") };
        post("deps", req, (resp:TDev.DepsResponse) => {
            console.log(resp.libraryIds);
        });
    });
}

export function parse(args:string[])
{
    writeResultsHeader(() => {
        parseCore(args, (id, f) => {
            fs.readFile(path.resolve(path.dirname(args[0]), id), "utf-8", (err, data) => {
                f(data);
            })
        })
    })
}

export function docs(args:string[])
{
    parseCore(args, getScriptAsync, (req) => { req.prettyDocs = true; }, (id:string, resp:TDev.ParseResponse) => {
        if (resp.numErrors > 0) {
            logParseResponse(id, resp);
        } else {
            writeResultsHeader(() => {
                fs.appendFileSync("results.html", resp.prettyDocs)
            })
        }
    });
}

export function topic(args:string[])
{
    writeResultsHeader(() => {
        post("docs", { topic: args[0] }, (d) => {
            fs.appendFileSync("results.html", d.prettyDocs)
            d.prettyDocs = 'dumped to results.html';
            console.log(d)
        })
    })
}

export function compile(args:string[])
{
    parseCore(args, getScriptAsync, (req) => {
        // req.compilerOptions = { artUrlSuffix: "?releaseid=foobar-123.213" }
    }, (id:string, resp:TDev.ParseResponse) => {
        if (resp.numErrors > 0) {
            logParseResponse(id, resp);
        } else {
            console.log(resp.packageResources);
            fs.writeFileSync("compiled.js", resp.compiledScript);
        }
    });
}

export function optimize(args: string[]) {
    if (args.length == 0) {
        getScript("");
        args = Object.keys(scriptsCache);
    }

    writeResultsHeader(() => {
        fs.appendFileSync("results.html", "<table><tr><td>Id</td><td>OKs eliminated</td>" +
            "<td>Inlining (calls to)</td><td>Inlining (inlined actions)</td><td>Actions</td>" +
            "<td>Statements</td><td>Terms reused</td><td>Constants propagated</td><td>Reaching Definitions Time (ms)</td><td>Inline Analysis Time (ms)</td>" +
            "<td>Used Analysis Time (ms)</td><td>Available Expressions time (ms)</td><td>Constant Propagation time (ms)</td><td>Compile Time (ms)</td></tr>")
        parseCore(args, getScriptAsync, updateParserRequest, (id: string, resp: TDev.ParseResponse) => {
            if (resp.numErrors > 0) {
                if (scriptsWithErrors.indexOf(id) >= 0) {
                } else {
                    fs.appendFileSync("results.html", "<tr><td>" + id + "</td><td>FAILED</td></tr>");
                    console.log("Script %d FAILED", id);
                }
            } else {
                fs.appendFileSync("results.html", "<tr><td>" + id + "</td><td>" + resp.numOkEliminations
                    + "</td><td>" + resp.numInlinedCalls + "</td><td>" + resp.numInlinedFunctions
                    + "</td><td>" + resp.numActions + "</td><td>" + resp.numStatements
                    + "</td><td>" + resp.termsReused + "</td><td>" + resp.constantsPropagated
                    + "</td><td>" + resp.reachingDefsTime + "</td><td>" + resp.inlineAnalysisTime
                    + "</td><td>" + resp.usedAnalysisTime + "</td><td>" + resp.availableExprsTime
                    + "</td><td>" + resp.constantPropagationTime
                    + "</td><td>" + resp.compileTime + "</td></tr>");
                console.log("Script %s, numOksEliminated: %d\tnumCallsInlined: %d\tnumFunctionsInlined: %d",
                    id, resp.numOkEliminations, resp.numInlinedCalls, resp.numInlinedFunctions);
            }
        }, true);
    });
}


export function azure(args:string[])
{
    parseCore(args, getScriptAsync, (req) => {
        req.prettyScript = 0;
        req.compile = false;
        req.requiredPlatformCaps = -1
    }, (id:string, resp:TDev.ParseResponse) => {
        console.log(JSON.stringify(resp, null, 2))
    });
}

export function test(args:string[])
{
    if (args.length == 0) {
        getScript("");
        [
            "anmxa", "brng", "cjep", "etbm",
            "hgcc", "hpjq", "mcrl", "pyqya",
            "qubz", "tozq", "wpfi", "wmrn",
            "xeid", "xxrc", "ywvc", "juwc",
            "juwy", "nwqba", "drdw", "qstd",
            "zfzv", "mbcb", "fqcy", "xylk",
            "mxjr", "mxjr", "osdurmos", "ekwbwjnw",
            "ahzh", "rfgn", "kehh", "tpjra",
            "abxe", "pcojyqpe", "lqgfmjdf", "fnwna",
            "jhrx", "nykob", "zzni", "ajnsa",
            "wfwujpwu", "qrki", "skuw", "jvkg", "nhkja",
            "mpuj", "adic", "afnpa", "ajgo", "aeud", "aoek", "apmc", "bccm", "bfkxa", "bjxf", "blrna", "bllm", "bwsn", "byfw", "bxfh", "ckun", "bzhm", "cjcr", "clpl", "csbb", "cmni", "cqvda", "czrm", "dgjy", "dlsq", "dmdf", "dxwt", "dvyr", "dzsy", "eabr", "edhk", "emgla", "evar", "evai", "exaca", "fexj", "fccczsrg", "fjkqa", "fxvk", "ggzd", "gemt", "ggoe", "gjzj", "gjmy", "glay", "gmrx", "gyiz", "gbfoa", "haon", "hcov", "heyg", "hinx", "hjwb", "hspx", "htbp", "hztb", "iery", "igsha", "ilhma", "isng", "izgp", "jbyk", "jjeg", "jjiba", "juir", "kaip", "kcfe", "kctl", "khbb", "kmdsa", "krxg", "kstla", "kwhr", "kuyw", "kxjy", "lalxa", "lalh", "lbji", "lbre", "lebt", "lczi", "lvgu", "lsmt", "lyzb", "manx", "mizi", "mwhy", "mrrv", "mvswa", "mxxx", "nnrq", "nnfd", "nlwsxwgu", "nsem", "nyyw", "obrr", "orko", "osyh", "ovjx", "ovxi", "ozcl", "pcmea", "pjtc", "pqqh", "pugra", "prqv", "pvkc", "pwbd", "pwbla", "piwi", "pvyja", "pynz", "qcbx", "qerh", "qgsr", "qvnv", "qxas", "rgax", "rpvj", "rrhib", "sfjlb", "sbxc", "sldu", "slmo", "sreo", "sryh", "ssln", "suqkc", "sxwz", "tduo", "tigo", "tkdw", "tmjz", "tplja", "tqxy", "tuoq", "twkt", "uaif", "uabp", "ugqk", "uncq", "uytn", "uzjqajmk", "vcmv", "vdrva", "vfnl", "vgug", "vjxt", "vxzy", "vziza", "wbmba", "wdus", "wkhu", "wmbnsqtu", "wnuj", "wznb", "wpoj", "wsmj", "wwpv", "wxpfa", "xhnr", "xiwf", "xkcz", "xtgb", "xrfg", "xtwe", "xtmk", "xzbra", "ycmp", "ycpn", "ybas", "yelya", "ygswa", "yqabb", "yshr", "yvdu", "yyyfa", "zpiha", "zpty", "zrgf", "zzue", "aego", "ahcf", "anfc", "bliv", "brxe", "inww", "pdsp", "slji", "syyc", "wgri", "xbmw", "slvj", "bjkl", "zggfa", "syut", "kkqo", "fovb", "axbp", "sntk", "dijf", "sean", "ooyf", "umaxa", "ytuj", "advp", "kkso", "wjod", "rlyq", "rreyb", "gapm", "swcg", "jdwx", "kfddwdyd", "rxvya", "gtyl", "kpcw", "hrwi", "qmwm", "pqmg", "reetuiyr", "ufwv", "egysa", "bzlb", "bjdv", "vqnr", "pwxr", "njkn", "zhjh", "aetg", "jyaxa", "kbix", "ergz", "lykxa", "kmjn", "gpvi", "sspc", "bdvk", "igmfatzq", "dkue", "puzy", "bbel", "uygyxxwb", "tgre", "sbvxa", "kvad", "ewlu", "ivgr", "bdke", "ovkh", "vfwb", "emzf", "iimo", "xyyu", "jhqy", "ufon", "xrec", "pbyx", "moji", "fiol", "kxoh", "nvwh", "tmbv", "hwtc", "uykt", "bkxz", "eteg", "qzxua", "rxdb", "jhtd", "zmkw", "fdnp", "hhzx", "mmtf", "xrasa", "ugvc", "uhso", "nlgx", "sduw", "heuk", "isqq", "kanf", "ihap", "zxks", "daay", "kiwg", "dlpoa", "udlk", "jdjv", "hdxq", "wxsq", "wxjpa", "rgah", "cqbba", "jhgp", "pogpa", "hlhb", "ebvk", "nsrl", "otfe", "celpa", "wxbma", "gvxka", "gjzz", "qjroa", "izpua", "awsv", "dmhca", "abcva", "gdmktghk", "ghkj", "haop", "fsxda", "rwem", "pfqk", "isijadvo", "dxlz", "qnvdskvs", "sktz", "tvbpa", "gbqs", "wtrt", "thtf", "avcl", "akmxa", "qzar", "agnm", "imol", "rcnk", "mkbq", "olnx", "zkvo", "gimd", "wcwo", "mfzx", "czap", "ctwh", "rgny", "bipl", "nnbe", "whdlb", "vuyo", "ornu", "pnco", "oeqbc", "vjgo", "rjola", "lull", "ppfgrqsm", "aodq", "zsmvfpxz", "iebq", "queub", "bxtua", "giko", "icox", "alsq", "ujti", "bpur", "eyzu", "lmcgjiny", "qozr", "jcvw", "mypmmnjw", "wxoza", "aimo", "xuxo", "phfz", "skmm", "gdwxa", "pfcw", "dyob", "felo", "zkmu", "sohra", "ztsrb", "ikkn", "atnj", "xdswa", "ascb", "rfco", "atgpa", "atfc", "appla", "jxyib", "mtsm", "spmoa", "vzxl", "kuira", "nhre", "caon", "qjkm",
        ].forEach(id => delete scriptsCache[id]);

        args = Object.keys(scriptsCache);
    }

    writeResultsHeader(() => {
        parseCore(args, getScriptAsync, (req) => { req.testAstSerialization = false; });
    });
}

export function platform(args:string[])
{
    parseCore(args, getScriptAsync, (req) => {
        req.requiredPlatformCaps = 3918285; // WinRT
    }, (id, resp) => {
        console.log(resp);
    });
}

function interesting(i) {
    return true; // i.positivereviews >= 2 || i.comments > 0 || i.runs > 50 || i.installations > 10 || i.screenshots > 1;
}

export function update(args:string[])
{
    var days = args[0] ? parseFloat(args[0]) : 7;
    var url = "new-scripts"
    var maxScripts = 10000;
    if (days == -1) {
        days = 10000;
        url = "showcase-scripts"
    }
    if (days == -2) {
        url = "top-scripts";
        days = 10000;
        maxScripts = 2000;
    }
    var cutOffTime = Date.now()/1000 - days * 3600 * 24;
    var considered = 0;
    var hits = 0;

    function handleList(d) {
        var lst = JSON.parse(d);
        var pastDueDate = false;
        lst.items.forEach((i) => {
            if (i.time > cutOffTime && considered < maxScripts) {
                considered++;
                if (interesting(i)) {
                    hits++;
                    getScriptAsync(i.id, (d) => { });
                }
            } else {
                pastDueDate = true;
            }
        });

            console.log("considered %d, got %d hits", considered, hits);
        if (!pastDueDate && lst.continuation) {
            get(lst.continuation);
        } else {
            console.log("considered %d, got %d hits", considered, hits);
        }
    }

    function get(cont:string)
    {
        tdevGet(url + "?count=1000&applyupdates=true" + (cont ? "&continuation=" + cont : ""), handleList)
    }

    get(null)

}

export function tags(args:string[])
{
    var cnt = args[0] ? parseFloat(args[0]) : 50;

    tdevGet("tags?count=100", (data) => {
        var lst = JSON.parse(data);
        lst.items.forEach((it) => {
            tdevGet(it.id + "/scripts?count=" + cnt, (d) => {
                var lst = JSON.parse(d);
                lst.items.forEach((i) => {
                    if (interesting(i))
                        getScriptAsync(i.id, (d) => { });
                })
            })
        });
    });
}

export function embedwp8(args:string[])
{
    var id = args[0]
    if (!/^\d{18}.*-\d{5,6}$/.test(id)) {
        console.error("wrong release id");
        return;
    }
    var appDir = "TouchDevelopWinPhone8/TouchDevelopWinPhone8/"
    if (/81/.test(args[1]))
        appDir = "TouchDevelopWinPhone81/TouchDevelopWinPhone8/"
    var arfn = appDir + "AutoRefresh.cs"
    var arf = fs.readFileSync(arfn, "utf8")
    var ok = false;
    arf = arf.replace(/(string InternalReleaseId =\s*")[^"]*"/, (mm, p) => {
        ok = true;
        return p + id + "\""
    });
    if (!ok) {
        console.error("cannot update release id")
        return;
    }
    fs.writeFileSync(arfn, arf);

    var m = /string\[\] InternalXapFiles\s*=\s*\{([^\}]*)\}/.exec(arf)
    var fileList:string[] = eval("[" + m[1] + "]")
    fileList.push("release.html");

    var trg = appDir + "Html/"
    var pref = "https://az31353.vo.msecnd.net/app/"

    fileList.forEach(file => {
        var url = pref + id + "/" + file
        var path = null
        if (file == "release.html") path = ""
        else if (file == "error.html") path = ".error"
        if (path != null)
            url = "https://www.touchdevelop.com/app/" + path + "?releaseid=" + id + "&rewrite=false"
        tdevGet(url, data => {
            fs.writeFileSync(trg + file, data);
            console.log("SAVED %s, %d chars", file, data.length)
        })
    })
}

function logParseResponse(id:string, resp:TDev.ParseResponse)
{
    if (!resp) resp = <any>{ numErrors: 42 }

    //if (resp.compiledScript)
    //    fs.appendFileSync("compiled.txt", resp.compiledScript);
    if (scriptsWithErrors.indexOf(id) >= 0) {
        if (resp.numErrors == 0) {
            console.error("Expecting errors in %s!", id);
            numErrors++;
        }
    } else {
        if (resp.numErrors > 0) {
            console.error("ERRORS %s (%d),\n%s", id, resp.numErrors, resp.status);
            numErrors++;
            fs.appendFileSync("results.html", "<h2>Errors " + id + "</h2>" + resp.prettyScript, "utf-8");
            var resp2 = JSON.parse(JSON.stringify(resp))
            resp2.prettyScript = "";
            resp2.status = "";
            fs.appendFileSync("results.json", JSON.stringify(resp2, null, 2))
            fs.appendFileSync("errors.json", JSON.stringify(id) + ",");
        }
    }
}

function updateParserRequest(req:TDev.ParseRequest)
{
}

function writeResultsHeader(f:()=>void)
{
    post("css", {}, (d) => {
        fs.writeFileSync("results.html",
            "<!DOCTYPE html><html><head><meta charset='utf-8'/>\n" + d.css +
            "</head><body>", "utf-8");
        fs.writeFileSync("results.json", "", "utf-8");
        fs.writeFileSync("errors.json", "", "utf-8");
        f();
    })
}

function parseCore(args: string[], get: (s: string, f: (t: string) => void ) => void , updateReq = updateParserRequest, callback = logParseResponse,
    optimize = false)
{
    var numArgs = 0;

    args.forEach((arg) => {
        numArgs++;
        get(arg, (text) => {
            var req = <TDev.DepsRequest> { script: text };
            post("deps", req, (resp: TDev.DepsResponse) => {
                if (!resp) {
                    console.log("cannot get deps for " + arg)
                    return
                }

                var req2: TDev.ParseRequest;
                if (optimize) {
                    req2 = <TDev.ParseRequest> { id: arg, script: req.script, libraries: [], prettyScript: 2, compile: false, optimize: optimize };
                } else {
                    req2 = <TDev.ParseRequest> { id: arg, script: req.script, libraries: [], prettyScript: 2, compile: true };
                }
                function finish() {
                    updateReq(req2);
                    post("parse", req2, (resp:TDev.ParseResponse) => {
                        callback(arg, resp);
                        if (--numArgs == 0) {
                            afterParse();
                        }
                    });
                }

                var numLibs = 1;
                resp.libraryIds.forEach((id) => {
                    numLibs++;
                    get(id, (text) => {
                        req2.libraries.push({ id: id, script: text });
                        numLibs--;
                        if (numLibs == 0) finish();
                    })
                });
                numLibs--;
                if (numLibs == 0) finish();
            });
        })
    });
}

function writePassThroughResponse(resp:any) {
    if (typeof resp == "string") {
        fs.writeFileSync("results.html", resp)
        console.log("results.html written");
    } else {
        if (resp.error)
            console.log("error: " + resp.error)
        fs.writeFileSync("results.json", JSON.stringify(resp, null, 2))
        console.log("results.json written");
    }
}

function language(args:string[])
{
    post("language", { path: args[0] }, writePassThroughResponse);
}

function queryCore(id:string, path:string, skipDeps:boolean, f)
{
    getScriptAsync(id, (text) => {
        var req = <TDev.DepsRequest> { script: text };
        post("deps", req, (resp:TDev.DepsResponse) => {
            var req2 = <TDev.QueryRequest> { id: id, script: req.script, libraries: [], path: path };

            function finish() {
                post("query", req2, f)
            }

            var numLibs = 1;
            resp.libraryIds.forEach((id) => {
                if (skipDeps) return;
                numLibs++;
                getScriptAsync(id, (text) => {
                    req2.libraries.push({ id: id, script: text });
                    numLibs--;
                    if (numLibs == 0) finish();
                })
            });
            numLibs--;
            if (numLibs == 0) finish();
        });
    })
}

function query(args:string[])
{
    var skipDeps = false;
    if (args[args.length - 1] == "nodeps") {
        args.pop();
        skipDeps = true;
    }

    if (args.length != 2) return;

    queryCore(args[0], args[1], skipDeps, writePassThroughResponse)
}

function readList(fn:string):any[]
{
    var s = fs.readFileSync(fn, "utf8")
    var r = JSON.parse("[" + s + "{}]")
    r.pop()
    return r
}

var scriptInfo:any = {}

function scriptInfoList():any[] {
    return Object.keys(scriptInfo).map(k => scriptInfo[k])
}

function readToScriptInfo(fn:string) {
    var obj = scriptInfo
    readList(fn).forEach(o => {
        if (!obj[o.id]) obj[o.id] = o
    })
}

function addinfo(args:string[])
{
    readToScriptInfo("withinfo.json")
    readToScriptInfo("scripts.json")

    var start = Date.now()

    var total = 0
    function go() {
        astinfoChunk(n => {
            total += n
            console.log(total + " done, " + (Date.now() - start) + "ms")
            if (n) go();
        })
    }
    go()
}
//totalRuns\":0,\"totalInstallations\":1,\"totalCurrentInstallations\":1,\"totalUsers\":

function injectstats(args:string[])
{
    var scripts:any[] = JSON.parse(fs.readFileSync("withstats.json", "utf8"))
    var rr = "[\n"
    scripts.forEach((s,i) => {
        if (s.stats) {
            var ss = s.stats = JSON.parse(s.stats)
            s.runs = ss.totalRuns
            s.installations = ss.totalInstallations
        }
        if (i > 0) rr += ","
        rr += JSON.stringify(s) + "\n"
    })
    rr += "\n]"
    fs.writeFileSync("withinfo2.json", rr)
}

function addstats(args:string[])
{
    var access_token = "?" + fs.readFileSync('access_token.txt', 'utf-8').replace(/[#\r\n]/g, "")
    var scripts:any[] = JSON.parse(fs.readFileSync("withinfo.json", "utf8"))

    var num = 0
    var k = 0
    scripts.forEach(s => {
        num++
        tdevGet(s.id + "/stats" + access_token, resp => {
            if (resp)
                fs.writeFileSync("stats/" + s.id + ".json", JSON.stringify(resp))
            s.stats = resp
            if (++k % 100 == 0)
                console.log(k)
            if (--num == 0) {
                fs.writeFileSync("withstats.json", JSON.stringify(scripts))
            }
        })
    })
}

function addinfo2(args:string[])
{
    var lst = readList("withbase.json")
    lst.sort((a,b) => a.time - b.time)
    var elts = ""
    lst.forEach(s => {
        var j = JSON.parse(fs.readFileSync("astinfo/" + s.id + ".json", "utf8"))
        s.astinfo = j
        elts += JSON.stringify(s) + ",\n"
    })
    fs.writeFileSync("withinfo.json", elts)
}

function sizeHist(f,scripts:any[])
{
    var sizes = []
    for(var i = 0;i < 3000;++i) sizes.push(0)

    var total = 0
    scripts.forEach(s => {
        if (f(s)) {
            total++
            var sz = Math.min(s.astinfo.features.anystmt, sizes.length - 1)
            sizes[sz]++
        }
    })

    var res = []
    var tot = 0
    sizes.forEach((num,sz) => {
        tot += num
        res.push((total - tot)*100/total)
    })

    return { num:total, hist: res }
}

function distr(fn:string, scripts:any[], f, max=1000)
{
    var byV = {}
    scripts.forEach(s => {
        var k = f(s)
        if (byV[k])
            byV[k]++
        else
            byV[k] = 1
    })


    var res = Object.keys(byV).map(k => { return { name: parseFloat(k), value: byV[k] } })
    res.sort((a,b) => b.name - a.name)
    var tot = 0
    res.forEach(r => {
        var v = r.value
        r.value += tot
        tot += v
    })

    res.reverse()
    res = res.slice(0,max)
    var csv = fn + ",#" + fn + "\n"
    res.forEach(k => {
        csv += k.name + "," + k.value + "\n"
    })
    fs.writeFileSync("num" + fn + ".csv", csv)
}

function mdistr(fn:string, maxVal:number, data:any)
{
    var buckets = []
    var results = []
    for (var i = 0; i <= maxVal; ++i) {
        buckets.push(0)
        results.push([i])
    }

    var lbl = fn + ","

    Object.keys(data).forEach(k => {
        var n = data[k].length
        lbl += k + "(" + n + "),"
        var hist = buckets.slice(0)
        var total = 0
        data[k].forEach(v => {
            total += v
            if (v > maxVal) v = maxVal
            hist[v]++
        })
        var curr = 0
        for (var j = hist.length - 1; j >= 0; j--) {
            var aa = curr
            curr += hist[j]
            hist[j] += aa
        }
        hist.forEach((v, i) => results[i].push(v*100 / n))
        console.log(fn + "." + k + ": mean=" + (total/n) + " n=" + n)
    })

    var csv = lbl + "\n"
    results.forEach(arr => csv += arr.join(",") + "\n")

    fs.writeFileSync("numH-" + fn + ".csv", csv)
}

function distrs(fn:string, scripts:any[], f)
{
    var byV = {}
    scripts.forEach(s => {
        var k = f(s)
        if (byV[k])
            byV[k]++
        else
            byV[k] = 1
    })


    var res = Object.keys(byV).map(k => { return { name: k, value: byV[k] } })
    res.sort((a,b) => b.value - a.value)
    res = res.slice(0,1000)
    var csv = fn + ",#" + fn + "\n"
    res.forEach(k => {
        csv += k.name + "," + k.value + "\n"
    })
    fs.writeFileSync("num-s-" + fn + ".csv", csv)
}

function infostats(args:string[])
{
    console.log("reading scripts...")
    var scripts:any[] = JSON.parse(fs.readFileSync("withinfo.json", "utf8"))
    console.log("reading users...")
    var userList:any[] = JSON.parse(fs.readFileSync("users.json", "utf8"))
    console.log("computing...")
    var users = {}
    var byId = {}
    var byBucket = {}
    userList.forEach(u => {
        users[u.id] = u
        u.effortM = 0
        u.runs = 0
        u.installations = 0
        u.hearts = 0
        u.hearts1 = 0
        u.numscripts = 0
        u.numPhone = 0
        u.numTablet = 0
        u.numDesktop = 0
        u.numNonTrivial = 0
    })
    var totalEffort = 0
    var nonTutEffort = 0
    var totalSize = 0
    var nonTutSize = 0
    //var hist=[0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0]
    var tutorialIds = {}
    var pubUsers = {}
    var realPubUsers = {}
    var allfeat = {}
    var allfeatScr = {}

    scripts = scripts.filter(s => {
        switch (s.userid) {
            case "pboj": // TD Samples
            case "jeiv": // TD Docs
            case "frsk": // TD Demo
            case "vnzw": // TD Tests
                return false
            case "wonm": // Michal
            case "ajlk": // Peli
            case "gxfb": // Nikolai
            case "ikyp": // Tom
            case "bqsl": // Sebastian
            case "dlkr": // Manuel
            case "expza": // Jonathan
                return false

            default:
                return true
        }
    })

    scripts.forEach(s => {

        byId[s.id] = s
        s.user = users[s.userid]
        s.succ = []
        s.base = s.baseid ? byId[s.baseid] : null
        s.totalsucc = 0
        s.usedby = []
        s.usedbyothers = []
        pubUsers[s.userid] = 1

        var feat = s.astinfo.features

        Object.keys(feat).forEach(k => {
            if (!allfeat.hasOwnProperty(k)) {
                allfeat[k] = 0
                allfeatScr[k] = 0
            }
            allfeat[k] += feat[k]
            allfeatScr[k]++
        })

        var diff = feat
        if (s.base) {
            diff = msSubtract(diff, s.base.astinfo.features)
            s.depth = s.base.depth + 1
            s.root = s.base.root
            if (s.base.succ.length == 0 && s.base.ismain) {
                s.ismain = true
            } else {
                s.root.totalsucc++
            }
            s.base.succ.push(s)
            s.isremix = (s.base.userid != s.userid)
            s.istransremix = s.isremix || s.base.istransremix
        } else {
            s.depth = 0
            s.ismain = true
            s.isremix = false
            s.istransremix = false
            s.root = s
        }
        s.effort = Object.keys(diff).length
        s.effortM = msCard(diff)
        var bid = s.astinfo.bucketId
        if (byBucket[bid]) {
            var d = s.astinfo.duplicateNo = byBucket[bid]++
            if (!tutorialIds[bid] && s.astinfo.duplicateNo >= 10 && !s.base) {
                tutorialIds[bid] = s
            }
            //if (d < hist.length) hist[d]++
        } else {
            s.astinfo.duplicateNo = 0
            byBucket[bid] = 1
        }

        s.useslibs = 0
        s.usesotherslibs = 0

        s.librarydependencyids.forEach(id => {
            var lib = byId[id]
            if (!lib) {
                return
            }
            if (lib.userid == "pboj" || lib.userid == "jeiv") return
            lib.usedby.push(s)
            s.useslibs++
            if (lib.userid != s.userid) {
                s.usesotherslibs++
                lib.usedbyothers.push(s)
            }
        })
    })

    var allfeatList = Object.keys(allfeat)
    allfeatList.sort((a,b) => allfeat[b] - allfeat[a])
    var csv = "feature,uses,scripts\n"
    allfeatList.slice(0,1000).forEach(k => {
        csv += k + "," + allfeat[k] + "," + allfeatScr[k] + "\n"
    })
    fs.writeFileSync("numfeatures.csv", csv)

    var totalPlat = {}

    scripts.forEach(s => {
        totalEffort += s.effortM
        totalSize += s.astinfo.features.anystmt
        var bid = s.astinfo.bucketId
        if (!s.base && tutorialIds[bid]) {
            s.effort = 0
            s.effortM = 0
            s.isTrivial = true
        } else {
            realPubUsers[s.userid] = 1
            s.user.effortM += s.effortM
            nonTutSize += s.astinfo.features.anystmt
            nonTutEffort += s.effortM
            s.isTrivial = false
            s.user.numNonTrivial++
        }

        s.user.runs += s.runs
        s.user.installations += s.installations
        s.user.hearts += s.positivereviews
        s.user.hearts1 += Math.max(s.positivereviews - 1, 0)
        s.user.numscripts++

        if (!s.userplatform) s.userplatform = ["unknown"]
        s.userplat = {}
        s.userplatform.forEach(k => {
            s.userplat[k] = 1
            totalPlat[k] = (totalPlat[k] + 1) || 1
        })

        if (s.userplat["cellphone"] || s.userplat["legacywindowsphoneapp"]) {
            s.from = "phone"
            s.user.numPhone++
        } else if (s.userplat.tablet) {
            s.from = "tablet"
            s.user.numTablet++
        } else if (s.userplat.unknown) {
            s.from = "unknown"
        } else {
            s.from = "desktop"
            s.user.numDesktop++
        }

    })

    //console.log(totalPlat)

    Object.keys(tutorialIds).forEach(bid => {
        var s = tutorialIds[bid]
        //console.log(util.inspect(new Date(s.time*1000)) + ": /" + s.id + " " + s.name + " " + s.astinfo.features.anystmt + " " + byBucket[bid])
    })

    userList.forEach(u => {
        u.commscore = u.runs / 50 + u.hearts1 + u.installations / 5
    })

    //console.log(hist)

    var results = {
        all: s => true,
        r100: s => s.runs >= 100,
        r500: s => s.runs >= 500,
        uniq: s => s.astinfo.duplicateNo == 0,
        nonTut: s => !tutorialIds[s.astinfo.bucketId],
        //r1000: s => s.runs >= 1000,
        //h10: s => s.positivereviews >= 10
    }

    var lbls = ["size"]
    var data = []

    Object.keys(results).forEach(k => {
        var r = sizeHist(results[k], scripts)
        lbls.push(k + "(" + r.num + ")")
        data.push(r.hist)
    })

    csv = lbls.join(",") + "\n"
    data[0].forEach((dd,i) => {
        csv += [i].concat(data.map(d => d[i])).join(",") + "\n"
    })
    fs.writeFileSync("sizes.csv", csv)

    distr("scriptsize", scripts, s => s.astinfo.features.anystmt,10000)
    distr("succ", scripts, s => s.succ.length)
    distr("hearts", scripts, s => s.positivereviews)
    distr("runs", scripts, s => s.runs)
    distr("installs", scripts, s => s.installations)
    distr("depth", scripts, s => s.depth)
    distr("totalsucc", scripts, s => s.totalsucc)
    distr("effort", scripts, s => s.effort)
    distr("effortM", scripts, s => s.effortM)
    distr("effortMU", scripts.filter(s => !!s.base), s => s.effortM)

    distr("libs", scripts.filter(s => s.usedby.length > 0), s => s.usedby.length)
    distr("libs-others", scripts.filter(s => s.usedbyothers.length > 0), s => s.usedbyothers.length)

    distr("usereffort", userList.filter(u => u.effortM > 0), u => u.effortM)
    distr("userscore", userList, u => u.commscore)

    var nonTut = scripts.filter(s => !!s.base || !tutorialIds[s.astinfo.bucketId])

    mdistr("update", 500, {
        "all": nonTut.map(s => s.effortM),
        "updates": nonTut.filter(s => !!s.base && !s.isremix).map(s => s.effortM),
        "initial": nonTut.filter(s => !s.base).map(s => s.effortM),
        "remix": nonTut.filter(s => s.isremix).map(s => s.effortM),
    })

    distrs("derived", scripts, s => s.ismain ? "main" : "derived")

    function count(lbl, f) {
        console.log(lbl + ": " + scripts.filter(f).length)
    }

    count("remixes", s => s.isremix)
    count("trans-remixes", s => s.istransremix)
    count("unique", s => s.astinfo.duplicateNo == 0)
    count("non-tutorials*", s => !tutorialIds[s.astinfo.bucketId])
    count("non-tutorials", s => !!s.base || !tutorialIds[s.astinfo.bucketId])

    console.log("users who published: " + Object.keys(pubUsers).length)
    console.log("users who published non-tutorial: " + Object.keys(realPubUsers).length)
    console.log("effort: " + totalEffort + " (" + nonTutEffort + ")")
    console.log("published statements: " + totalSize + " (" + nonTutSize + ")")

    //var csv = "category,users,runs,meanRuns,hearts,meanHearts,meanDays\n"
    var csv = "category,runs,days*10\n"
    function categorize(lbl:string, userList:any[])
    {
        var totalRuns = 0
        var totalHearts = 0
        var totalDays = 0
        userList.forEach(u => {
            totalRuns += u.runs
            totalHearts += u.hearts
            totalDays += u.activedays
        })
        var n = userList.length
        //csv += [lbl, n.toString(), totalRuns.toString(), fmt(totalRuns/n), totalHearts.toString(), fmt(totalHearts/n),
        //        fmt(totalDays/n)].join(",") + "\n"
        csv += [lbl + " (" + n + ")", fmt(totalRuns/n), fmt(totalDays/n*10)].join(",") + "\n"
    }

    categorize("All users", userList)
    var nonTrivialUsers =   userList.filter(u => realPubUsers[u.id])
    categorize("Published script", userList.filter(u => u.numscripts > 0))
    categorize("Published non-trivial", nonTrivialUsers)
    categorize("Published 2+ non-trivial", userList.filter(u => u.numNonTrivial >= 2))
    /*
    categorize("Published 3+ non-trivial", userList.filter(u => u.numNonTrivial >= 3))
    categorize("Published 5+ non-trivial", userList.filter(u => u.numNonTrivial >= 5))

    categorize("effort 100+", userList.filter(u => u.effortM > 100))
    categorize("effort 200+", userList.filter(u => u.effortM > 200))
    categorize("effort 500+", userList.filter(u => u.effortM > 500))
    categorize("effort 1000+", userList.filter(u => u.effortM > 1000))
    categorize("effort 2000+", userList.filter(u => u.effortM > 2000))
    */

    function byPlatform(suff, userList:any[]) {
        categorize("Desktop only" + suff, userList.filter(u => u.numDesktop && u.numTablet + u.numPhone == 0))
        categorize("Mobile only" + suff, userList.filter(u => u.numTablet + u.numPhone > 0 && u.numDesktop == 0))
        //categorize("phone-only" + suff, userList.filter(u => u.numPhone > 0 && u.numDesktop + u.numTablet == 0))
        //categorize("tablet-only" + suff, userList.filter(u => u.numTablet > 0 && u.numDesktop + u.numPhone == 0))
        categorize("Mobile+desktop" + suff, userList.filter(u => u.numPhone + u.numTablet > 0 && u.numDesktop > 0))
    }

    byPlatform("", userList)

    /*

    userList.sort((a,b) => b.runs - a.runs)
    //byPlatform("+s20", userList.slice(20))
    byPlatform("+s50", userList.slice(50))

    var cutoff = new Date(2014,1,1).getTime()/1000
    byPlatform("+recent", userList.filter(u => u.time > cutoff))
    cutoff = new Date(2013,10,1).getTime()/1000
    byPlatform("+old", userList.filter(u => u.time < cutoff))
    byPlatform("+nt", nonTrivialUsers)
    */

    fs.writeFileSync("num-usercat.csv", csv)


    var nts = scripts.filter(s => !s.isTrivial)
    nts.sort((a,b) => b.runs-a.runs)
    var nts50 = nts.slice(50)

    csv = ""
    var csv2:string = null

    var nonHidden = scripts.filter(s => !s.ishidden && !s.isTrivial)

    function catscr(lbl:string, f)
    {
        var runs = []
        var counts = []
        var sizes = []
        var lbls = []

        function doone(lb, lst) {
            var n = 0
            var totalRuns = 0
            var totalSize = 0

            lst.forEach(s => {
                if (!f(s)) return
                n++
                totalRuns += s.runs
                totalSize += s.astinfo.features.anystmt
            })

            runs.push(fmt(totalRuns/n))
            sizes.push(fmt(totalSize/n/10))
            counts.push(n)
            lbls.push(lb)
        }

        doone("all", scripts)
        doone("nt", nts)
        doone("nt-50", nts50)
        doone("public", nonHidden)

        if (!csv) {
            csv = ["category"]
                .concat(lbls.map(s => "runs " + s))
                .concat(lbls.map(s => "num " + s))
                .concat(lbls.map(s => "size " + s))
                .join(",") + "\n"
        }

        csv += [lbl + " (" + counts[0] + ")"].concat(runs).concat(counts).concat(sizes).join(",") + "\n"

        if (csv2)
            csv2 += [lbl + " (" + counts[3] + ")", runs[3], sizes[3]].join(",") + "\n"
    }

    catscr("all", s => true)
    catscr("trivial", s => s.isTrivial)
    catscr("not-unknown", s => !s.userplat.unknown)

    catscr("from phone", s => s.from == "phone")
    catscr("from tablet", s => s.from == "tablet")
    catscr("from mobile", s => s.from == "tablet" || s.from == "phone")
    catscr("from desktop", s => s.from == "desktop")
    catscr("from unknown", s => s.from == "unknown")

    catscr("Windows", s => s.userplat.win)
    catscr("Windows8", s => s.userplat.win8plus)
    catscr("Mac", s => s.userplat.macOSX)
    catscr("Linux", s => s.userplat.x11)
    catscr("Android", s => s.userplat.android)
    catscr("Windows Phone 7", s => s.userplat.legacywindowsphoneapp)
    catscr("Windows Phone 8 app", s => s.userplat.wp8app)
    catscr("Windows Phone 8 browser", s => s.userplat["ie10.phone"])
    catscr("iOS", s => s.userplat["safari.phone"] || s.userplat["safari.tablet"])

    catscr("Android Tablet", s => s.userplat.android && s.userplat.tablet)
    catscr("Android Phone", s => s.userplat.android && s.userplat.cellphone)
    catscr("iPhone", s => s.userplat["safari.phone"])
    catscr("iPad", s => s.userplat["safari.tablet"])
    catscr("IE tablet", s => s.userplat["ie10.tablet"] || s.userplat["ie11.tablet"])

/*

  firefox: 6995,
  'chrome.phone': 4449,
  'chrome.tablet': 2864,
  'safari.phone': 2035,
  'safari.tablet': 4648,
  'ie10.phone': 1513,
  winVista: 565,
  iPod: 231,
  'chrome.desktop': 28922,
  'safari.desktop': 2103,
  'ie10.desktop': 5190,
  'firefox.desktop': 6359,
  'ie11.desktop': 3060,
  ie11: 5719,
  'ie11.tablet': 2658,
*/

    fs.writeFileSync("num-scrcat.csv", csv)

    csv2 = "category,runs,size\n"

    catscr("non-trivial", s => !s.isTrivial)
    catscr("uses art", s => s.art)
    catscr("uses lib", s => s.useslibs)
    catscr("uses lib not from others", s => s.useslibs && !s.usesotherslibs)
    catscr("uses lib from others", s => s.usesotherslibs)
    catscr("uses lib from others not transremix", s => !s.istransremix && s.usesotherslibs)
    catscr("uses board", s => s.astinfo.features.Board > 0)
    catscr("uses box", s => s.astinfo.features.pages > 0)
    catscr("uses box and board", s => s.astinfo.features.Board > 0 && s.astinfo.features.pages > 0)
    catscr("no box no board", s => !s.astinfo.features.pages && !s.astinfo.features.Board)

    catscr("has comment", s => s.astinfo.features.comment > 0)
    catscr("has data", s => s.astinfo.features.data > 0)
    catscr("has action param", s => s.astinfo.features.actionParameter > 0)
    catscr("has record def", s => s.astinfo.features.recordDef > 0)

    catscr("depth 1+", s => s.depth >= 1)
    catscr("depth 2+", s => s.depth >= 2)
    catscr("depth 3+", s => s.depth >= 3)
    catscr("depth 5+", s => s.depth >= 5)
    catscr("depth 10+", s => s.depth >= 10)
    catscr("depth 20+", s => s.depth >= 20)
    catscr("depth 40+", s => s.depth >= 40)
    catscr("is remix", s => s.isremix)
    catscr("is trans remix", s => s.istransremix)

    function fmtscr(s) {
        return s.id + ": " + s.name + " by " + s.username + " (" + s.userid + ")"
    }
    //nbb.sort((a,b) => b.runs-a.runs)
    //nbb.slice(0,50).forEach(s => console.log(fmtscr(s)))

    fs.writeFileSync("num-scrcatnt.csv", csv2)


    csv = "userid,username,runs,totalruns\n"
    var allRuns = 0
    userList.slice(0,2000).forEach(u => {
        allRuns += u.runs
        csv += u.id + ",\"" + u.name + "\"," + u.runs + "," + allRuns + "\n"
    })
    fs.writeFileSync("num-userruns.csv", csv)

    /*
    scripts.sort((a,b) => b.usedby.length - a.usedby.length)
    scripts.slice(0,50).forEach(s => {
        console.log(s.usedby.length + "  " + s.id + ": " + s.name + " by " + s.username + "(" + s.userid + ")")
    })
    */



    console.log("(user) runs/installs: " + correlation(userList.map(u => u.runs), userList.map(u => u.installations)))
    console.log("(user) runs/hearts: " + correlation(userList.map(u => u.runs), userList.map(u => u.hearts)))
    console.log("(user) runs/hearts1: " + correlation(userList.map(u => u.runs), userList.map(u => u.hearts1)))
    console.log("(user) runs/effort: " + correlation(userList.map(u => u.runs), userList.map(u => u.effortM)))

    var s0 = scripts.filter(s => s.runs + s.installations + s.positivereviews > 0)

    console.log("(script) runs/installs: " + correlation(s0.map(u => u.runs), s0.map(u => u.installations)))
    console.log("(script) runs/hearts: " + correlation(s0.map(u => u.runs), s0.map(u => u.positivereviews)))
}

function astinfoChunk(f) {
    var numDone = 0
    var maxDone = 50
    var numPending = 0

    var s = ""

    function finish() {
        fs.appendFile("withinfo.json", s, "utf-8", (err) => {
            f(numDone)
        })
    }

    Object.keys(scriptInfo).forEach(k => {
        var o = scriptInfo[k]
        if (!o.astinfo) {
            if (numDone > maxDone) return;
            numDone++;
            numPending++;
            var finished = false;
            var timer = setTimeout(() => {
                if (!finished) {
                    console.log("timed out " + k)
                    delete scriptInfo[k]
                    if (--numPending == 0) finish();
                }
            }, 20000)
            queryCore(k, "astinfo", false, (info) => {
                o.astinfo = info
                s += JSON.stringify(o) + ",\n"
                finished = true;
                clearTimeout(timer)
                if (--numPending == 0) finish();
            })
        }
    })
}


function addbase0(args:string[]) {
    var bases = {}
    readList("base0.json").forEach(s => {
        bases[s.id] = s.baseid
    })

    var allscr = ""
    readList("scripts.json").forEach(s => {
        if (bases.hasOwnProperty(s.id)) {
            s.baseid = bases[s.id]
            allscr += JSON.stringify(s) + ",\n"
        }
    })

    fs.writeFileSync("withbase.json", allscr)
}

function addbase(args:string[]) {
    localUrl = "http://www.touchdevelop.com"

    readToScriptInfo("withbase.json")
    readToScriptInfo("withinfo.json")

    var objs = scriptInfoList()
    var tm = Date.now()
    var done = 0

    function addbaseChunk() {
        var robjs = objs.filter(o => !o.hasOwnProperty('baseid'))
        console.log(robjs.length + " left, " + done + " done, " + (Date.now()-tm) + "ms")
        var toask = []
        var elts = ""
        function set(o,i) {
            o.baseid = i
            elts += JSON.stringify(o) + ",\n"
            done++
        }
        var nobj = []

        robjs.forEach(o => {
            if (toask.length > 40) return;
            if (o.rootid == o.id)
                set(o, null)
            else {
                nobj.push(o)
                toask.push({ method: "GET", relative_url: o.id + "/base" })
            }
        })

        if (toask.length) {
            post("", { array: toask }, (resp) => {
                //    console.log(resp)
                nobj.forEach((o, i) => {
                    var b = resp.array[i].body
                    set(o, b ? b.id : null)
                })
                fs.appendFileSync("withbase.json", elts)
                addbaseChunk()
            })
        } else {
            fs.appendFileSync("withbase.json", elts)
        }
    }

    addbaseChunk()
}

function removedups(args:string[])
{
    var minIn = parseInt(args[0]) || 20
    var bybi:any = {}
    var elts = readList("withinfo.json")
    elts.forEach(o => {
        var b = o.astinfo.bucketId
        if (!bybi[b]) bybi[b] = 0
        bybi[b]++
    })
    var numDups = 0
    var dupB = 0
    Object.keys(bybi).forEach(k => {
        var n = bybi[k]
        if (n >= minIn) {
            numDups += n
            dupB++
        }
    })
    console.log(numDups + " duplicates in " + dupB + " buckets of " + elts.length)
}

var scriptsCache:any;
function getScript(id:string)
{
    if (!scriptsCache) {
        var f = fs.readFileSync('generated/scripts.cache', 'utf-8');
        var fj = JSON.parse('{' + f + ' "theEnd": {} }');
        delete fj.theEnd;
        scriptsCache = fj;

        /*
        if (fs.existsSync("cache")) {
            fs.readdirSync("cache").forEach(line => {
                var obj = JSON.parse(fs.readFileSync("cache/" + line, "utf-8"))
                console.log(line)
                delete obj.theEnd;
                Object.keys(obj).forEach(k => {
                    scriptsCache[k] = obj[k]
                })
            })
        }

        console.log(Object.keys(scriptsCache).length + " scripts loaded")

        var dirs = {}
        var num = 0
        Object.keys(scriptsCache).forEach(k => {
            if (!dirs[k[0]] && !fs.existsSync("scr/" + k[0])) {
                fs.mkdirSync("scr/" + k[0])
                dirs[k[0]] = 1
            }
            var d = k[0] + "/" + k[0] + k[1]
            if (!dirs[d] && !fs.existsSync("scr/" + d)) {
                fs.mkdirSync("scr/" + d)
                dirs[d] = 1
            }
            fs.writeFileSync("scr/" + d + "/" + k, scriptsCache[k], "utf-8")
            if (++num % 100 == 0) console.log(num)
        })
        */
    }
    return scriptsCache[id];
}

function downloadScript(arg:string, f:(s:string) => void)
{
    tdevGet(arg + "/text?original=true&ids=true", (text) => {
        function save(text) {
            if (!scriptsCache[arg]) {
                scriptsCache[arg] = text;
                fs.appendFileSync('generated/scripts.cache', '"' + arg + '": ' + JSON.stringify(text) + ",\n", "utf-8");
            }
            f(text);
        }
        if (text && /^meta version \"v2.2,/.test(text)) {
            console.log("downloaded %s - original", arg);
            save(text);
        } else {
            tdevGet(arg + "/text", (text) => {
                if (text) {
                    console.log("downloaded %s - upgraded", arg);
                    save(text);
                } else {
                    console.error("not found: %s", arg);
                    numErrors++;
                }
            })
        }
    });
}

function splittexts(args:string[])
{
    getScript("foobar")
    Object.keys(scriptsCache).forEach(n => {
        fs.writeFileSync("text/" + n, scriptsCache[n], "utf8")
    })
}

function getScriptAsync(id:string, f:(s:string)=>void)
{
    var s = getScript(id);
    if (s) f(s);
    else {
        var fn = "scr/" + id[0] + "/" + id[0] + id[1] + "/" + id
        fs.exists(fn, (res) => {
            if (res)
                fs.readFile(fn, "utf-8", (err, text) => {
                    f(text)
                })
            else
                downloadScript(id, f);
        })
    }
}

export function libroots(args:string[])
{
    var libroots = {}
    var authors = {}

    readList("scripts.json").forEach(s => {
        if (s.islibrary) {
          libroots[s.id] = s.userid + ":" + s.rootid + ":" + s.name
        }
        authors[s.id] = s.userid
    })

    fs.writeFileSync("libroots.json", JSON.stringify(libroots,null,1))
    fs.writeFileSync("authors.json", JSON.stringify(authors,null,1))
}

export function dlall(args:string[])
{
    var num = 0
    var max = 100000000
    if (args[0] && parseInt(args[0])) max = parseInt(args[0])
    fs.writeFileSync("scripts.json", "", "utf-8");

    function handleList(d) {
        var lst = JSON.parse(d);
        var s = ""
        lst.items.forEach((i) => {
            if (i.id == args[0]) num = max + 1;
            if (num > max) return;
            num++;
            s += JSON.stringify(i) + ",\n"
            // getScriptAsync(i.id, (d) => { });
        });
        fs.appendFileSync('scripts.json', s, "utf-8");
        console.log("saved chunk, num " + num)

        if (num > max) return;

        if (lst.continuation) {
            get(lst.continuation);
        }
    }

    function get(cont:string)
    {
        tdevGet("new-scripts?count=500" + (cont ? "&continuation=" + cont : ""), handleList)
    }

    get(null)
}

export function download(args:string[])
{
    args.forEach((arg) => {
        if (getScript(arg)) return;
        downloadScript(arg, () => {});
    });
}

export function buildtest(args:string[])
{
    var port = 12000 + Math.floor(Math.random()*10000);
    var now = Date.now();
    localUrl = "http://localhost:" + port + "/";
    var p = child_process.fork("build/noderunner.js", [ port + "", "silent" ], { silent: true });
    p.stderr.pipe(<any>process.stderr);
    afterParse = () => {
        console.log("kill server");
        p.kill();
        var d = Date.now() - now;
        console.log("done, " + d/1000 + " sec");
        if (numErrors > 0) {
            console.error("%d error(s)", numErrors);
            process.exit(1);
        }
    };
    setTimeout(() => { test(args); }, 1000);
}

function recursiveDir(p:string)
{
    var res = []
    function rec(p:string) {
        fs.readdirSync(p).forEach((fn) => {
            var ff = path.join(p, fn);
            if (fs.statSync(ff).isDirectory())
                rec(ff);
            else
                res.push(ff);
        })
    }
    rec(p);
    return res;
}

export function stringCompare(an:string, bn:string)
{
    if (an == bn) return 0;
    if (an < bn) return -1;
    return 1;
}


export function updatelang(args:string[])
{
    var langs = []

    var allTrans = {}
    var numStarted = 0

    var strings = {}
    var usedSet = {}
    JSON.parse(fs.readFileSync("build/localization.json", "utf8")).strings.forEach(s => {
        usedSet[s] = 1
        if(s)
            strings[s] = s;
    })
    fs.writeFileSync("generated/strings.json", JSON.stringify(strings, null, 2));

    var arrToStr = arr => {
        var res = "["
        var hadNl = false
        arr.forEach((v, i) => {
            if (!v) {
                res += "0,"
                hadNl = false
            } else {
                if (!hadNl) res += "\n"
                res += JSON.stringify(v) + ",\n"
                hadNl = true
            }
        })
        res = res.replace(/,\n?$/, "") + "\n]"
        return res
    }

    var finish = () => {
        var keys = {}
        var res = "TDev.Util._languageData = function (lang) {\n"
        langs.forEach(l => {
            Object.keys(allTrans[l]).forEach(k => {
                if (keys[k] === 1) return
                if (usedSet.hasOwnProperty(k)) {
                    keys[k] = 1
                }
                else {
                    console.log("skipping: " + k)
                    //keys[k] = 1
                }
            })
        })
        var kk = Object.keys(keys)
        kk.sort()
        kk.forEach((k, i) => keys[k] = i)
        res += "var keys = " + arrToStr(kk) + ";\n\n"
        if (!fs.existsSync("build/locale"))
            fs.mkdirSync("build/locale");
        langs.forEach(l => {
            var arr = []
            var tr = {};
            var map = allTrans[l]
            var numTr = 0
            Object.keys(map).forEach(k => {
                if (keys[k] !== undefined) {
                    arr[keys[k]] = map[k]
                    tr[k] = map[k];
                    numTr++
                }
            })
            console.log("%s: %d translations", l, numTr)
            for(var i = 0; i < arr.length; ++i)
                if (!arr[i]) arr[i] = 0
            res += "if (lang == \"" + l + "\") { TDev.Util._setLanguageArray(keys, " + arrToStr(arr) + "); return true; }\n\n"
            fs.writeFileSync("build/locale/" + l + ".json", JSON.stringify(tr));
        })
        res += "\n    return false;\n}\n\n"
        fs.writeFileSync("generated/langs.js", res)
    }
    
    fs.readdirSync("locales").forEach((folder: string) => {
        var fn = "locales/" + folder + "/strings.json";
        console.log("importing " + fn);
        var js = JSON.parse(fs.readFileSync(fn, "utf8"));
        Object.keys(js).forEach(key => {
            if (!js[key]) delete js[key];
        })
        allTrans[folder] = js;
        langs.push(folder);
    })
    
    finish();

/*    
    tdevGet("https://touchdeveloptranslator.azurewebsites.net/api/languages", resp => {
        var ll = JSON.parse(resp)
        langs = Object.keys(ll)

        langs.forEach(l => {
            numStarted++
            tdevGet("https://touchdeveloptranslator.azurewebsites.net/api/export/" + l, resp => {
                allTrans[l] = JSON.parse(resp)[l]
                if (--numStarted == 0)
                    finish()
            })
        })
    })
    */
}

function art(args:string[])
{
    if (!fs.existsSync("help-images"))
        fs.mkdirSync("help-images");
    getArt(args[0], () => {})
}

function fetchhistory(args:string[])
{
    (<any>setTimeout(() => {
        console.error("watchdog expired")
        process.exit(1)
    }, 15*60*1000)).unref()

    var access_token = "?" + fs.readFileSync('access_token.txt', 'utf-8').replace(/[#\r\n]/g, "")
    var url = args[0]

    var checked = false


    function getFrom(cont:string) {
        tdevGet(url + access_token + "&count=300" + cont, text => {
            var resp = JSON.parse(text);
            var lst = resp.headers || resp.items
            lst.forEach((scr) => {
                var targetFile = args[1] + "/" + scr.guid + ".json"

                if (fs.existsSync(targetFile)) return;

                if (!checked && !fs.existsSync(args[1]))
                    fs.mkdirSync(args[1])
                checked = true;

                var user = url.replace(/\/.*/, "")
                var burl = user + "/installed/" + scr.guid + "/history"
                var hurl = burl + access_token + "&count=100"
                var hentries = 0
                var allEntries = []
                var saveData = { userid: user, guid: scr.guid, lastStatus: "", items: allEntries }

                function oneDone() {
                    if (--hentries > 0) return;
                    fs.writeFile(targetFile, JSON.stringify(saveData, null, 2), "utf8", err => {
                        if (err) console.error(err)
                    })
                }

                //console.log("fetch " + saveData.guid)
                function getHFrom(cont:string) {
                    hentries++;
                    tdevGet(hurl + cont, text => {
                        if (!text) return;
                        var resp = JSON.parse(text);
                        resp.items.forEach(it => {
                            if (!saveData.lastStatus) saveData.lastStatus = it.scriptstatus
                            if (it.scriptstatus != "published" && it.scriptstatus != "unpublished") return;
                            allEntries.push(it)
                            hentries++;
                            if (it.scriptstatus == "published")
                                tdevGet(it.scriptid + "/text", text => {
                                    if (!text) {
                                        console.error("no text for script " + it.scriptid)
                                    }
                                    it.script = text
                                    oneDone()
                                })
                            else
                                tdevGet(burl + "/" + it.historyid + access_token, text => {
                                    if (text) {
                                        var resp = JSON.parse(text)
                                        it.script = resp.bodies[0].script
                                    }
                                    if (!it.script) console.error("no body in " + it.historyid)
                                    //console.log("got entry %s", it.historyid)
                                    oneDone()
                                })
                        })
                        if (resp.continuation) getHFrom("&continuation=" + resp.continuation)
                        oneDone()
                    })
                }
                getHFrom("")
            })
            if (resp.continuation) getFrom("&continuation=" + resp.continuation)
        })
    }
    getFrom("")
}

function compresshistory(args:string[])
{
    var inp = fs.readdirSync(args[0])
    inp.forEach((fn, idx) => {
        if (!/\.json$/.test(fn)) return;
        //if (idx > 3) return;
        fs.readFile(args[0] + "/" + fn, "utf-8", (err, data) => {
            //console.log(err)
            // console.log(fn + ": " + err)
            var d = JSON.parse(data)
            if (d.lastStatus == "deleted") return;
            //console.log(fn + ": " + data.length)
            post("compresshistory", d, resp => {
                if (!resp) {
                    console.log("failed for " + fn)
                    return;
                }
                fs.writeFile(args[1] + "/" + fn,  JSON.stringify(resp, null, 2), "utf-8", err => {
                    if (err) console.log(err)
                })
            })
        })
    })
}

function getusers() { getOneList("users", false, () => {}) }

function fetchscriptinfo(args:string[]) {
    var fn = args.shift()

    if (fn == "ALL") {
        args = []
        fs.readdirSync("getlistdata").forEach(fn => {
            if (/^scripts\.\d/.test(fn))
                args.push("getlistdata/" + fn)
        })
        fn = args.shift()
    }

    if (!fn)
        return

    var scripts:any[] = JSON.parse(fs.readFileSync(fn, "utf8"))
    var num = 0
    var numU = 0
    var oneup = () => {
        if (--num == 0) {
            console.log("SAVE " + fn)
            if (numU > 0)
                fs.writeFileSync(fn, JSON.stringify(scripts, null, 2))
            scripts = null
            fetchscriptinfo(args)
        }
    }

    num++
    scripts.forEach(s => {
        if (s.rootid == s.id)
            s.baseid = ""
        else if (s.baseid) {}
        else {
            num++
            tdevGet(s.id + "/base", text => {
                if (text)
                    s.baseid = JSON.parse(text).id
                else s.baseid = ""
                numU++
                oneup()
            })
        }

        if (!s.text) {
            num++
            tdevGet(s.id + "/text?original=true&ids=true", text => {
                s.text = text
                numU++
                oneup()
            })
        }
    })
    oneup()
}

function getOneList(name:string, saveFiles:boolean, f:()=>void)
{
    var hurl = name + "?count=500"
    var dir = "getlistdata/"
    if (!/localhost/.test(localUrl)) {
        var m = /(.*)\?(.*)/.exec(localUrl)
        if (/tdpublogger/.test(localUrl)) {
            hurl = localUrl + hurl
        } else if (m) {
            hurl = m[1] + "api/" + name + "?" + m[2]
        } else {
            hurl = localUrl + "api/" + hurl
        }
        dir = "getlistdata2/"
    }
    // if (name == "comments") hurl = "comments?count=10"
    var allUsers = []
    var n = 0
    var seen:any = {}

    function getHFrom(cont:string) {
        tdevGet(hurl + cont, text => {
            var resp = JSON.parse(text);
            console.log("%d.  %s: %d", n++, hurl + cont, resp.items.length)
            if (saveFiles)
                allUsers = []
            resp.items.forEach(it => {
                if (it.id && seen[it.id]) return;
                seen[it.id]=true
                allUsers.push(it)
            })
            if (saveFiles)
                fs.writeFile(dir + name + "." + Date.now() + ".json", JSON.stringify(allUsers, null, 2), "utf8",
                    err => {
                        if (err) throw err;
                        if (resp.continuation) {
                            fs.writeFile(dir + "cont." + name, resp.continuation, "utf8", err => {
                                if (err) throw err
                                getHFrom("&continuation=" + resp.continuation)
                            })
                        }
                    })
            else {
                if (resp.continuation) getHFrom("&continuation=" + resp.continuation)
                else {
                    fs.writeFileSync(name + ".json", JSON.stringify(allUsers, null, 2))
                }
            }
        })
    }

    fs.readFile(dir + "cont." + name, "utf8", (err, data) => {
        if (data) data = "&continuation=" + data.replace(/[\r\n]/g, "")
        else data = ""
        getHFrom(data)
    })
}

function getlist(args:string[])
{
    var num = 0
    args.forEach(a => {
        num++
        getOneList(a, true, () => {
            if (--num == 0) {
                console.log("DONE");
            }
        })
    })
}

function dlpubs(args:string[])
{
    localUrl = "http://www.touchdevelop.com"
    var pubs:any = {}
    var num = 1
    var arr = []

    var byKind:any = {}

    var oneUp = () => {
        if (--num == 0) {
            Object.keys(pubs).forEach(k => {
                var p = pubs[k]
                if (!byKind[p.kind])
                    byKind[p.kind] = []
                byKind[p.kind].push(p)
            })
            Object.keys(byKind).forEach(k => {
                byKind[k].sort((a, b) => b.time - a.time)
                fs.writeFileSync("tdp-" + k + ".json", JSON.stringify(byKind[k], null, 1))
            })
        } else console.log(num)
    }

    var flush = () => {
        if (arr.length == 0) return
        var arr0 = arr
        arr = []
        num++
        post("", { array: arr0 }, (resp) => {
            arr0.forEach((o, i) => {
                var b = resp.array[i]
                if (b.body) {
                    pubs[o.relative_url] = b.body
                } else if (b.code != 404) {
                    console.log(o.relative_url + ": " + b.code)
                }
            })
            oneUp()
        })
    }

    args.forEach(fn => {
        JSON.parse(fs.readFileSync(fn, "utf8")).forEach(ent => {
            if (arr.length > 40) flush()
            arr.push({ method: "GET", relative_url: ent.id })
        })
    })
    flush()
    oneUp()
}

function splitEntries(newEntries:any[], chunk:number)
{
    var allIds = {}
    newEntries = newEntries.filter(e => {
        if (e.kind == "script" && !e.text)
            return false
        if (e.id && allIds.hasOwnProperty(e.id))
            return false
        allIds[e.id] = e
        return true
    })

    var bases = {}
    var todo = {}
    newEntries.forEach(e => {
        if (e.baseid)
            bases[e.baseid] = e
        todo[e.id] = e
    })

    var goesFirst = e => bases.hasOwnProperty(e.id) || (e.baseid && todo.hasOwnProperty(e.baseid))
    newEntries = newEntries.filter(goesFirst).concat(newEntries.filter(e => !goesFirst(e)))

    var visited = {}

    var entries = []

    while (newEntries.length > 0) {
        var curr = []
        newEntries = newEntries.filter(e => {
            if (curr.length >= chunk) return true
            if (e.baseid && todo.hasOwnProperty(e.baseid)) return true
            if (!visited.hasOwnProperty(e.id)) {
                curr.push(e)
                visited[e.id] = 1
            }
            return false
        })
        if (curr.length == 0)
            throw new Error("cycle?")
        curr.forEach(e => { delete todo[e.id] })
        entries.push(curr)
    }

    return entries
}

function importlite(args:string[])
{
    var pref = args[0]
    var chunk = 40
    if (pref == "users")
        chunk = 100
    if (args[2])
        chunk = parseInt(args[2]) || 40

    var files = []

    if (args[3]) {
        files = args.slice(3)
    } else {

        var last = ""
        var lastFn = "getlistdata/importlite-last." + pref + ".json"
        if (fs.existsSync(lastFn)) {
            last = JSON.parse(fs.readFileSync(lastFn, "utf8")).file
        }

        fs.readdirSync("getlistdata").forEach(fn => {
            if (fn.slice(0, pref.length + 1) == pref + ".")
                files.push("getlistdata/" + fn)
        })

    }

    files.sort()
    files.reverse()

    if (last)
        files = files.filter(fn => fn <= last)

    var lastTime = Date.now()

    var nextFile = () => {
        var fn = files.shift()
        if (!fn) return // the end
        var delta = Date.now() - lastTime
        //if (delta > 30000) { console.log("delta " + delta + ", exiting") return }
        console.log("read " + fn + " " + delta)
        lastTime = Date.now()
        var newEntries = JSON.parse(fs.readFileSync(fn, "utf8"))
        newEntries.reverse()
        var entries = splitEntries(newEntries, chunk)
        newEntries = null

        if (entries.length == 0) {
            nextFile()
            return
        }

        if (fn && lastFn)
            fs.writeFileSync(lastFn, JSON.stringify({ file: fn }), "utf8")

        importEntries(entries, args[1], nextFile)

    }
    nextFile()
}

function importEntries(entries, key, cb)
{
    var handleFrom = (entries:any[]) => {
        var handleResp = resp => {
            if (!resp && --retries > 0) {
                console.log("RETRY")
                query()
                return
            }

            var cnts = {}
            resp.forEach(v => {
                var s = v + ""
                if (!cnts[s]) cnts[s] = 1
                else cnts[s]++
            })
            console.log(cnts)

            if (entries.length == 0)
                cb()
            else
                handleFrom(entries)
        }

        var hd = entries.shift()

        if (!hd) throw new Error("no header")

        var retries = 5
        var query = () => post("import?key=" + key, hd, handleResp)
        query()
    }
    handleFrom(entries)
}


function empties(args:string[])
{
    fs.readdirSync(args[0]).forEach(subdir => {
        var f = args[0] + '/' + subdir
        var s = fs.statSync(f)
        if (s.isDirectory() && fs.readdirSync(f).length == 0) {
            fs.rmdirSync(f)
        }
    })
}

function dlstats(args:string[])
{
    var byNum = {}
    fs.readdirSync(args[0]).forEach(subdir => {
        var f = args[0] + '/' + subdir
        var s = fs.statSync(f)
        if (s.isDirectory()) {
            var len = fs.readdirSync(f).length + "";
            if (!byNum[len]) byNum[len] = 0
            byNum[len]++;
        }
    })

    var total = 0
    Object.keys(byNum).forEach(k => {
        total += byNum[k]
        console.log("%s,%d,%d,%d", k, byNum[k], total, 77185-total)
    })
}

function printscript(args:string[])
{
    args.forEach(a => console.log(getScript(a)))
}

function byruns(args:string[])
{
    var minTime = Date.now()/1000 - 24*3600*parseInt(args[0] || "1")
    var byId:any = {}

    function getFrom(cont) {
        tdevGet("runs?count=500" + (cont ? "&continuation=" + cont : ""), (d) => {
            var resp = JSON.parse(d)
            var pastTime = false
            resp.items.forEach(it => {
                if (it.time < minTime) {
                    pastTime = true
                    return
                }
                var obj = byId[it.publicationid]
                if (!obj)
                    obj = byId[it.publicationid] = {
                        id: it.publicationid,
                        name: it.publicationname,
                        numRuns: 0,
                    }
                obj.numRuns++
            })

            console.log(Object.keys(byId).length)

            if (resp.continuation && !pastTime) getFrom(resp.continuation)
            else finish()
        })
    }

    function finish() {
        Object.keys(byId).forEach(k => {
            var o = byId[k]
            console.log("%d %s %s", o.numRuns, o.id, o.name)
        })
    }

    getFrom(null)
}

    export interface MultiSet
    {
        [index:string] : number;
    }

    export function msSubtract(a:MultiSet, b:MultiSet) : MultiSet {
      var r:MultiSet = {}
      Object.keys(a).forEach(function(k) {
        var d = 0
        if (b.hasOwnProperty(k)) d = b[k]
        var n = a[k] - d
        if (n > 0) r[k] = n
      })
      return r
    }

    export function msAdd(a:MultiSet, b:MultiSet) : MultiSet {
      var r:MultiSet = {}
      Object.keys(a).forEach(function(k) {
        var d = 0
        if (b.hasOwnProperty(k)) d = b[k]
        r[k] = a[k] + d
      })
      Object.keys(b).forEach(function(k) {
        if (!a.hasOwnProperty(k))
          r[k] = b[k]
      })
      return r
    }

    export function msCard(a:MultiSet)
    {
        var c = 0
        Object.keys(a).forEach(k => {
            c += a[k]
        })
        return c
    }


function buckethist(args:string[])
{
    var buckets:any = {}
    var btime:any = {}
    var day = 24*3600
    var users = getUsersInRange()

    function forEachUser(cb) {
        if (!args[0]) return

        fs.readdirSync(args[0]).forEach((f, i) => {
            //if (i > 100) return

            if (i % 500 == 0) console.log(i)
            var m = /^(\w+)\.json$/.exec(f)
            if (m && users[m[1]]) {
                var fn = args[0] + "/" + f
                cb(JSON.parse(fs.readFileSync(fn, "utf-8")))
            }
        })
    }

    function decompress(d) {
        d.slots.forEach(s => {
            var f:MultiSet = {}
            s.entries.forEach(e => {
                f = msAdd(f, e.features)
                e.features = f
            })
        })
    }

    var pubFeatures = {}

    forEachUser(d => {
        var localbuckets:any = {}
        decompress(d)
        d.slots.forEach(s => {
            s.entries.forEach(e => {
                if (e.pubid)
                    pubFeatures[e.pubid] = e
                var b = e.bucketId
                if (!btime[b] || btime[b] > e.time)
                    btime[b] = e.time
                if (localbuckets.hasOwnProperty(b)) return
                localbuckets[b] = 1
                if (!buckets.hasOwnProperty(b)) buckets[b] = 0
                buckets[b]++
            })
        })
    })

    Object.keys(buckets).forEach(k => {
        if (buckets[k] == 1) delete btime[k]
    })

    if (args[0])
        fs.writeFileSync("buckethist.json", JSON.stringify(btime, null, 1))

    var perUser = {}

    var authors:any = JSON.parse(fs.readFileSync("authors.json", "utf-8"))

    var now = Date.now() / 1000
    var missing = {}

    forEachUser(d => {
        var allEntries = []

        d.slots.forEach(s => {
            if (s.baseid) {
                if (pubFeatures.hasOwnProperty(s.baseid)) {
                    var e0 = s.entries[0]
                    var e00 = JSON.parse(JSON.stringify(pubFeatures[s.baseid]))
                    e00.time = e0.time - 1
                    //s.entries.unshift(e00)
                    e0.features = msSubtract(e0.features, s.entries[0].features)
                } else {
                    console.log("pub script missing: " + s.baseid)
                    missing[s.baseid] = 1
                    s.entries[0].features = {}
                }
            }

            s.entries.forEach(e => allEntries.push(e))
        })

        if (allEntries.length == 0) return

        allEntries.sort((a, b) => a.time - b.time)
        var stopTime = allEntries[allEntries.length - 1].time
        // active in last month
        //if (stopTime < now - 30 * 24 * 3600) return

        var startTime = allEntries[0].time

        var knows = {}
        var steps = 0
        var learningSteps = []
        var userEntry = {
            steps: learningSteps,
            start: startTime,
            stop: stopTime,
        }
        perUser[d.uid] = userEntry
        allEntries.forEach((e,i) => {
            steps++
            var t0 = btime[e.bucketId]
            if (t0 && t0 < e.time) {
                return
            }
            if (e.pubid && authors[e.pubid] && authors[e.pubid] != d.uid) {
                return
            }

            // consider progress in first month
            //if (e.time - startTime > 30*24*2600) return

                //console.log("accept " + e.bucketId + " " + e.time + " " + JSON.stringify())
            var flst = []
            Object.keys(e.features).forEach(f => {
                if (knows.hasOwnProperty(f)) return
                //if (/^l:/.test(f)) return
                knows[f] = 1
                flst.push(f)
            })
            if (flst.length > 0 || i == allEntries.length - 1) {
                learningSteps.push({
                    edits: steps,
                    features: flst,
                    time: e.time
                })
                steps = 0
            }
        })

    })

    if (args[0]) {
        fs.writeFileSync("missingPubs.json", JSON.stringify(missing, null, 1))
        fs.writeFileSync("learningPerUser.json", JSON.stringify(perUser, null, 1))
    }
    else
        perUser = JSON.parse(fs.readFileSync("learningPerUser.json", "utf8"))


    var csv = "userid,start,stop,active,#learned,"

    var divs = 5

    for (var i = 0; i < divs; ++i) csv += "#" + i + ","
    for (var i = 0; i < divs; ++i) csv += "%" + i + ","
    csv += "\r\n"

    var numUsers = 0
    var totals = []


    Object.keys(perUser).forEach(u => {
        var ue = perUser[u]
        var steps = ue.steps
        var numLearned = 0
        var numEdits = 0
        steps.forEach(s => {
            numLearned += s.features.length
            numEdits += s.edits
        })
        ue.numLearned = numLearned
        ue.numEdits = numEdits

        if (numLearned == 0) return
        //if (numLearned < 150) return

        var cnts = [0]
        for(var i = 1; i < divs; i++)
            cnts.push(0)

        var pos = 0
        steps.forEach(s => {
            pos += s.edits
            var idx = Math.floor(pos * divs / (numEdits + 1))
            cnts[idx] += s.features.length
        })

        //if (cnts.filter(c => c == 0).length > 0) return

        numUsers++
        var d0 = Math.round((now - ue.start)/day)
        var d1 = Math.round((now - ue.stop)/day)
        var d2 = Math.round((ue.stop - ue.start)/day)
        var nums = [d0, d1, d2, numLearned].concat(cnts).concat(cnts.map(v => Math.round(v * 1000 / numLearned)))
        if (totals.length == 0) totals = nums
        else nums.forEach((n,i) => totals[i] += n)

        csv += u + "," + nums.join(",") + "\r\n"
    })

    csv += "AVG," + totals.map(v => Math.round(v / numUsers)).join(",") + "\r\n"

    fs.writeFileSync("learningCurves.csv", csv)
    computeCorrelations(perUser)
}

function fmt(n:number):string
{
    return (Math.round(n*100)/100).toString()
}

function correlation(x:any[], y:any[])
{
    var sx = 0
    var sy = 0
    var n = x.length
    for (var i = 0; i < n; ++i) {
        sx += x[i]
        sy += y[i]
    }
    var ax = sx / n
    var ay = sy / n

    var s0 = 0, s1 = 0, s2 = 0

    for (var i = 0; i < n; ++i) {
        var dx = x[i] - ax
        var dy = y[i] - ay
        s0 += dx * dy
        s1 += dx * dx
        s2 += dy * dy
    }

    var outliers = 0.2
    x.sort((a,b) => a - b)

    var startP = Math.round(x.length * outliers)
    var endP = Math.round(x.length * (1 - outliers))
    var sum = x[startP] * startP + x[endP - 1] * (x.length - endP);
    for (var i = startP; i < endP; ++i) {
        sum += x[i];
    }
    sum /= x.length;

    return fmt(s0 / (Math.sqrt(s1) * Math.sqrt(s2))) + "," + fmt(ax) + "," + fmt(sum);
   // x[Math.round(x.length / 2)];
}

function computeCorrelations(perUser:any)
{
    var userfeat = JSON.parse(fs.readFileSync("userfeat.json", "utf8"))
    var fuser = {}
    var users = {}
    userfeat.users.forEach(u => {
        fuser[u.id] = u.featureVec
        users[u.id] = u
    })
    userfeat.labels.push("cloud backups")
    userfeat.labels.push("features learned")

    var allData = "user id," + userfeat.labels.join(",") + "\r\n"

    var t0 = new Date(2013, 10, 1).getTime() / 1000;

    var deskRatio = userfeat.labels.indexOf("desktopRatio")
    var phoneRatio = userfeat.labels.indexOf("phoneRatio")
    var tabletRatio = userfeat.labels.indexOf("tabletRatio")
    var startTut = userfeat.labels.indexOf("start tutorial")

    var numSamples = 0
    var vecs:number[][] = []
    var catMap = {
        //old: [],
        //"new": [],
        total: [],
        desktop: [],
        phone: [],
        tablet: [],
        //mobileMix: [],
        mixed: [],
        tutorial0: [],
        tutorial1: [],
        tutorial3: [],
        tutorial5: [],
        //"old-phone": [],
        //"old-desktop": [],
        //"new-phone": [],
        //"new-desktop": [],
    }
    Object.keys(perUser).forEach(u => {
        if (fuser[u]) {
            var ue = perUser[u]
            if (ue.numLearned < 10) return
            var uu = users[u]
            var cats = ["total"]
            //cats.push(uu.time < t0 ? "old" : "new")
            var vec = fuser[u]
            if (vec[deskRatio] == 1)
                cats.push("desktop")
            else if (vec[phoneRatio] == 1)
                cats.push("phone")
            else if (vec[tabletRatio] == 1)
                cats.push("tablet")
            //else if (vec[phoneRatio] + vec[tabletRatio] == 1)
            //    cats.push("mobileMix")
            else if (vec[tabletRatio] + vec[phoneRatio] + vec[deskRatio] > 0)
                cats.push("mixed")
            if (vec[startTut] > 5)
                cats.push("tutorial5")
            if (vec[startTut] > 3)
                cats.push("tutorial3")
            if (vec[startTut] > 1)
                cats.push("tutorial1")
            if (vec[startTut] == 0)
                cats.push("tutorial0")
            //cats.push(cats.join("-"))
            numSamples++
            vec.push(ue.numEdits)
            vec.push(ue.numLearned)
            vecs.push(vec)
            allData += u + "," + vec.join(",") + "\r\n"
            cats.forEach(c => catMap[c].push(vec))
        }
    })

    var res = ""

    var getVec = (i:number) => vecs.map(v => v[i])

    var target = getVec(userfeat.labels.indexOf("features learned"))
    var target = getVec(userfeat.labels.indexOf("commScore"))
    var actDays = userfeat.labels.indexOf("active days")
    var days = getVec(actDays)
    var norm = (v:number[]) => v.map((k, i) => days[i] == 0 ? 0 : k / days[i]);
    var ntarg = norm(target)
    res += "property,corr,avg,median,corr (N),avg (N),median (N)"
    Object.keys(catMap).forEach(c => {
        res += ",avg " + c + "," + "median " + c
        // res += "," + c
    })
    res += "\r\n"
    userfeat.labels.forEach((l, i) => {
        res += l + "," + correlation(getVec(i), target)
        res +=     "," + correlation(norm(getVec(i)), ntarg) + ""
        Object.keys(catMap).forEach(c => {
            if (l == "one")
                res += "," + catMap[c].length + ","
            else
                res += correlation(catMap[c].map(v => v[i] / v[actDays]),
                            target).replace(/^[^,]*/, "")
        })
        res += "\r\n"
    })

    fs.writeFileSync("userfeat.csv", allData)
    fs.writeFileSync("correlations.csv", res)
}

function getticks(args:string[])
{
    var access_token = "?" + fs.readFileSync('access_token.txt', 'utf-8').replace(/[#\r\n]/g, "")
    var now = Math.floor(Date.now()/1000)
    var beg = new Date(2011, 8, 1).getTime() / 1000;
    // var beg = now - 1.5*365*24*3600
    var u = args[0]

    var url = "ticks" +access_token + "&start=" + beg + "&end=" + now

    if (u != "all")
        url += "&userid=" + u

    if (args[1])
        url += "&filter=" + args[1]

    tdevGet(url, d => {
        fs.writeFileSync("ticks/" + u + ".json", d)
    })
}

function counttut(args:string[])
{
    var ticks = JSON.parse(fs.readFileSync(args[0], "utf8"))
    var names = {}
    Object.keys(ticks.names).forEach(k => {
        names[ticks.names[k]] = k
    })

    var csv = "date,users*0.5,scripts,tutorials*0.2,edits*0.003\n"
    var init = [0,0,0,0]

    var sums = init.slice(0)
    var t0 = 0
    var prevWeek = -1
    var thisweek = init.slice(0)

    ticks.days.forEach(d => {
        if (!t0) t0 = d.time
        var dt = new Date(d.time * 1000)
        var thisday = init.slice(0)
        Object.keys(d.data).forEach(lbl => {
            var n = names[lbl]
            var idx = -1
            var m = 1
            if (/ADJ/.test(n)) {
                if (/ADJscript/.test(n) || /ADJapp/.test(n)) {
                } else idx = 2
            } else if (/startTutorial/.test(n)) {
                idx = 2
            } else if (n == "Pub.user") {
                idx = 0
            } else if (n == "Pub.script") {
                idx = 1
            } else if (n == "NavigateToCalculator" || n == "js.calcEdit") {
                idx = 3
            }
            if(idx == 2) m = 0.5
            else if(idx==0) m = 1
            else if(idx==3) m = 0.03
            var v = d.data[lbl].count
            if (v === undefined)
                v = d.data[lbl]
            if (typeof v != "number") v = 0
            if (idx >= 0)
                thisday[idx] += v*m
        })

        thisday.forEach((v,i) => {
            sums[i] += v
            thisweek[i] += v
        })

        var week = Math.floor((d.time - t0) / (3600*24*7))
        if (week != prevWeek) {
            //csv += dt.getDate() + "/" + (1+dt.getMonth()) + "/" + dt.getFullYear() + "," + thisweek.join(",") + "\n"
            csv += dt.getDate() + "/" + (1+dt.getMonth()) + "/" + dt.getFullYear() + "," + sums.join(",") + "\n"
            thisweek = init.slice(0)
            prevWeek= week
        }
    })

    fs.writeFileSync("tutorials.csv", csv)
}

/*
TODO - missing instrumentation
post comment!
view browser tab
create script from template
start interactive tutorial
*/

interface UserFeatureInfo {
    desc: string;
    tick?: string;
    tickRx?: RegExp;
    userFn?:(v:any,fm:any)=>number;
    cls?: string[];
}

var userFeatures:UserFeatureInfo[] = [
{ userFn: u => 1, desc: "one" },

{ tick: "mainKeyEvent",        desc: "press a key on the keyboard" },
{ tick: "calcEdit",        desc: "edit line of code" },
{ tick: "coreRun",        desc: "run a script" },
{ tick: "mainInit",        desc: "start web app" },
{ tick: "crashDialogDebug",    desc: "start debugger" },
{ tick: "viewLibraryRefInit",    desc: "edit library reference" },
{ tick: "sideCommentInit",    desc: "edit comment" },
{ tick: "corePublishPublic",    desc: "publish a script (public)",    cls: ["publish"] },
{ tick: "corePublishHidden",    desc: "publish a script (hidden)",    cls: ["publish"] },
{ tick: "sideAddEvent",        desc: "add a global event" },
{ tick: "calcHelp",        desc: "help from calculator" },
{ tick: "browseListDocs",    desc: "top-level help" },
{ tick: "hubCreateScript",    desc: "create fresh script" },
{ tick: "hubNotifications",    desc: "hub notifications" },
{ tickRx: /^js.browseTopic/,    desc: "browse help topic" },
{ tick: "browseHeart",        desc: "add heart to script" },
{ tick: "groupJoin",        desc: "joined a group" },
{ tick: "browseListGroups",    desc: "browse list of groups" },
{ tick: "browseListForum",    desc: "browse to the forum" },
{ tick: "calcKeyboardSearch",    desc: "use keyboard for property insert" },
{ tick: "calcStartSearch",    desc: "search for property" },
{ tick: "browseUpdate",        desc: "update script" },
{ tick: "editorUpdateLibrary",    desc: "update library" },
{ tick: "editorUpdateScript",    desc: "update script from editor" },
{ tick: "hubDocsTutorial",    desc: "tutorials dialog" },
{ tick: "hubUploadPicture",    desc: "upload art picture" },
{ tick: "hubUploadSound",    desc: "upload art sound" },
{ tickRx: /^Pub.comment$/,    desc: "post comment" },
{ tickRx: /^Pub.review$/,    desc: "add heart" },

{ tick: "codeExtractAction",    desc: "extract action",            cls: ["advanced"] },
{ tick: "sideFindRefs",        desc: "find references",        cls: ["advanced"] },
{ tick: "sideAddAction",    desc: "add action",            cls: ["advanced"] },
{ tick: "sideActionAddInput",    desc: "add action input parameter",    cls: ["advanced"] },
{ tick: "sideActionAddOutput",    desc: "add action output parameter",    cls: ["advanced"] },
{ tick: "sideAddActionTypeDef",    desc: "add action type",        cls: ["advanced"] },
{ tick: "sideAddLibrary",    desc: "add library reference",        cls: ["advanced"] },
{ tick: "sideAddPage",        desc: "add a page",            cls: ["advanced"] },
{ tick: "sideAddRecord",    desc: "add a record",            cls: ["advanced"] },
{ tick: "sideAddResource",    desc: "add an art resource",        cls: ["advanced"] },
{ tick: "sideAddVariable",    desc: "add a variable",            cls: ["advanced"] },
{ tick: "viewRecordInit",    desc: "edit record",            cls: ["advanced"] },
{ tick: "viewScriptInit",    desc: "edit script properties",        cls: ["advanced"] },
{ tick: "viewVariableInit",    desc: "edit variable properties",    cls: ["advanced"] },
{ tickRx: /^js.calcReplaceIn/,    desc: "code replace",            cls: ["advanced"] },
{ tick: "codeSurround",        desc: "surround code",            cls: ["advanced"] },

{ tick: "scriptTemplateADJscript",    desc: "new blank script",    cls: ["start script"] },
{ tick: "scriptTemplateADJgame",    desc: "new blank game",        cls: ["start script"] },
{ tick: "scriptTemplateADJcloud_app",    desc: "new blank cloud app",    cls: ["start script"] },
{ tick: "scriptTemplateADJapp",        desc: "new blank box app",    cls: ["start script"] },


{ tick: "scriptTemplateADJdrawing",    desc: "start tutorial drawing",        cls: [] },
{ tick: "scriptTemplateADJturtle",    desc: "start tutorial turtle",        cls: [] },
{ tick: "scriptTemplateADJsoundboard",    desc: "start tutorial soundboard",    cls: [] },
{ tick: "scriptTemplateADJlove",    desc: "start tutorial love",        cls: [] },
{ tick: "scriptTemplateADJrocks",    desc: "start tutorial rocks",        cls: [] },
{ tick: "scriptTemplateADJpopper",    desc: "start tutorial popper",        cls: [] },
{ tick: "scriptTemplateADJsong_shaker",    desc: "start tutorial song_shaker",    cls: [] },
{ tick: "scriptTemplateADJtap_counter",    desc: "start tutorial tap_counter",    cls: [] },
{ tick: "scriptTemplatecutestADJ_pet",    desc: "start tutorial cutest_pet",    cls: [] },
{ tick: "scriptTemplateADJspiral",    desc: "start tutorial spiral",        cls: [] },
{ tick: "scriptTemplateADJfractal",    desc: "start tutorial fractal",        cls: [] },
{ tick: "scriptTemplateADJcat",        desc: "start tutorial cat",        cls: [] },
{ tick: "scriptTemplateADJhide_and_seek",desc: "start tutorial hide_and_seek",    cls: [] },
{ tick: "scriptTemplateADJpong",    desc: "start tutorial pong",        cls: [] },
{ tick: "scriptTemplateADJmath",    desc: "start tutorial math",        cls: [] },
{ tick: "scriptTemplateADJsphero",    desc: "start tutorial sphero",        cls: [] },
{ tick: "scriptTemplateADJbeatbox",    desc: "start tutorial beatbox",        cls: [] },
{ tick: "scriptTemplateADJlevel",    desc: "start tutorial level",        cls: [] },

{ userFn: u => u.activedays, desc: "active days" },
{ userFn: u => u.receivedpositivereviews, desc: "number of hearts" },
{ userFn: u => u.subscribers, desc: "number of subscribers" },
{ userFn: u => Math.round((u.time - 1351753200) / (24 * 3600)), desc: "join time (days since Nov 1 2012)" },
{ userFn: u => u.features, desc: "public features" },
{ userFn: u => u.numScripts, desc: "numScripts" },
{ userFn: u => u.numPubScripts, desc: "numPubScripts" },
{ userFn: u => u.numHearts, desc: "numHearts" },
{ userFn: u => u.numRuns, desc: "numRuns" },
{ userFn: u => u.numInstallations, desc: "numInstallations" },
{ userFn: u => u.commScore, desc: "commScore" },
{ userFn: u => u.normCommScore, desc: "normCommScore" },
{ userFn: u => u.numAllPlat > 0 ? u.numPhone / u.numAllPlat : 0, desc: "phoneRatio" },
{ userFn: u => u.numAllPlat > 0 ? u.numDesktop / u.numAllPlat : 0, desc: "desktopRatio" },
{ userFn: u => u.numAllPlat > 0 ? u.numTablet / u.numAllPlat : 0, desc: "tabletRatio" },
{ userFn: (u, f) => {
    var numTut = 0
    Object.keys(f).forEach(k => {
        if (f[k] && /^start tutorial/.test(k))
            numTut++
    })
    return numTut
}, desc: "start tutorial" },
]

function getUsersInRange()
{
    var tStart = new Date(2013, 10, 1).getTime() / 1000;
    var tEnd = new Date(2014, 3, 1).getTime() / 1000;
    var users = {}
    JSON.parse(fs.readFileSync("users.json", "utf8")).forEach(u => {
        if (tStart <= u.time && u.time <= tEnd) {
            users[u.id] = u
        }
    })
    return users
}

function schedule(startNext:(logFn:string, done:()=>void)=>void, maxProc = 0)
{
    if (maxProc <= 0) maxProc = os.cpus().length

    var d = new Date().toISOString().replace(/[T:]/g, "-").replace(/\..*/, "")
    var logFn = "log-" + d

    for (var i = 0; i < maxProc; ++i) (()=>{
        var ii = i
        var done = () => {
            startNext(logFn + "--" + ii, done)
        }
        done()
    })();
}

function runNode(logFn:string, done:()=>void, args:string[])
{
    var str = fs.createWriteStream(logFn, { flags: "a"});

    var p = child_process.spawn("node", args, { });

    p.stderr.setEncoding("utf8")
    p.stdout.setEncoding("utf8")
    p.stderr.on("data", s => {
        process.stdout.write(s)
        str.write(s)
    })
    p.stdout.on("data", s => {
        str.write(s)
    })

    p.on("exit", (code) => {
        (<any>str).end(err => {
            done()
        })
    });
}

function consolidate(args:string[])
{
    var lbls = {
    "log-2014-05-02-21-06-30":"tutorial",
    "log-2014-05-02-21-10-35":"low-order",
    "log-2014-05-02-21-08-34":"no-order",
    "log-2014-05-02-21-54-21":"good-size",
    "log-2014-05-02-22-43-33":"w-locals",
    "log-2014-05-02-23-11-03":"w-lib-rec",
    "log-2014-05-02-23-22-38":"w-record-props",
    "log-2014-05-02-23-45-23":"looser-decl",
    "log-2014-05-14-22-54-44":"id-match",
    }

    var data = {}

    args.forEach(fn => {
        var lbl = lbls[fn.replace(/--\d+$/,"")]
        if (!lbl) {
            console.log("ignore " + fn)
            return
        }
        fs.readFileSync(fn,"utf8").split(/\r?\n/).forEach(ln => {
            var m = /^JSON (.*)/.exec(ln)
            if (!m) return
            var obj = JSON.parse(m[1])
            var d = data[obj.scriptId]
            if (!d)
                d = data[obj.scriptId] = { size: obj.numStmts }
            d[lbl] = obj.relSize
        })
    })

    var lblNames = ["size"].concat(Object.keys(lbls).map(k => <string>lbls[k]))
    var csv = "script," + lblNames.join(",") + "\n"
    Object.keys(data).forEach(k => {
        csv += k + "," + lblNames.map(x => data[k][x]).join(",") + "\n"
    })

    fs.writeFileSync("diffcomp.csv", csv)
}

function tmp1(args:string[])
{
    var data = []
    var useIt = {}
    fs.readFileSync("bigdiff.csv","utf8").split(/\r?\n/).forEach(ln => {
        var m = /^NICE ([a-z]+)/.exec(ln)
        if (m) {
            useIt[m[1]] = 1
            return
        }
        var toks = ln.split(/,/)
        if (!useIt[toks[1]]) return
        var bid = toks[0].replace(/ADDIDS /,"")
        data.push(bid + ":" + toks[1])
    })

    var curr = 0
    var getMore = () => {
        var id = data[curr++]
        if (!id) return []
        return [id]
    }

    schedule((logFn, done) => {
        console.log("TOGO " + (data.length - curr))
        var args = ["../noderunner", "addids"]

        while (args.length < 50) {
            var n = getMore()
            if (n.length == 0) break
            n.forEach(a => args.push(a))
        }

        if (args.length > 2)
            runNode(logFn, done, args)
    })


    /*
    var out = ""

    args.forEach(fn => {
        fs.readFileSync(fn,"utf8").split(/\r?\n/).forEach(ln => {
            var toks = ln.split(/,/)
            if (toks[0] == "ADDIDS ") return
            var add = parseInt(toks[6])
            var rem = parseInt(toks[7])
            if (add > 0 && rem > 0)
                out += ln + "\n"
        })
    })

    fs.writeFileSync("out.csv", out)
    */
}

function tmp0(args:string[])
{
    var bases = JSON.parse(fs.readFileSync("bases.json","utf8"))
    var roots = {}
    var classes = []

    Object.keys(bases).forEach(k => {
        var b = bases[k]
        if (b) {
            if (roots.hasOwnProperty(b))
                roots[k] = roots[b]
            else {
                console.log("bad order " + k, " base is " + b)
                bases[k] = null
                roots[k] = k
            }
        } else {
            roots[k] = k
        }
    })

    Object.keys(roots).forEach(k => {
        var r = roots[k]
        if (!classes[r]) classes[r] = []
        classes[r].push(k)
    })

    Object.keys(classes).forEach(k => {
        //if (classes[k].length < 5) delete classes[k]
    })

    var clIds = Object.keys(classes)

    /*
    clIds.forEach((e, i) => {
        var j = Math.floor(Math.random()*i)
        var tmp = clIds[i]
        clIds[i] = clIds[j]
        clIds[j] = tmp
    })
    */


    var curr = 0

    var getMore = () => {
        var id = clIds[curr++]
        if (!id) return []
        return classes[id].map(i => (bases[i] || "") + ":" + i)
    }

    schedule((logFn, done) => {
        console.log("TOGO " + (clIds.length - curr))
        var args = ["../noderunner", "addids"]

        while (args.length < 50) {
            var n = getMore()
            if (n.length == 0) break
            n.forEach(a => args.push(a))
        }

        if (args.length > 2)
            runNode(logFn, done, args)
    })



    /*
    var alls = {}
    JSON.parse(fs.readFileSync("withinfo.json","utf8")).forEach(s => {
        alls[s.id] = s.baseid
    })
    fs.writeFileSync("bases.json",JSON.stringify(alls, null,1))
    */

    /*
    var l = readList("withbase.json")

    var r = ""

    l.forEach((s,i) => {
        if (i % 20 == 19) r += "\n"
        r += s.id + " "
    })

    fs.writeFileSync("ids.txt", r)
    */

    /*
    l.sort((a,b) => a.time - b.time)
    l.slice(0,10).forEach(s => {
        console.log(s.id)
        console.log(new Date(s.time*1000))
        console.log(s.name)
        console.log(s.username)
    })
    */
}


function userfeat(args:string[])
{
    var users = getUsersInRange();

    var u0 = ""
    Object.keys(users).forEach(k => {
        var u = users[k]
        u.numScripts = 0
        u.numPubScripts = 0
        u.numHearts = 0
        u.numRuns = 0
        u.numInstallations = 0

        u.numPhone = 0
        u.numDesktop = 0
        u.numTablet = 0
        u.numAllPlat = 0

        u0 += u.id + "\n"
    })

    fs.writeFileSync("timeusers.txt", u0)

    readList("scripts.json").forEach(s => {
        var u = users[s.userid]
        if (u) {
            u.numHearts += s.positivereviews;
            u.numScripts++;
            if (!s.ishidden)
                u.numPubScripts++;
            u.numInstallations += s.installations
            u.numRuns += s.runs

            if (s.userplatform) {
                u.numAllPlat++
                if (s.userplatform.indexOf("cellphone") >= 0)
                    u.numPhone++;
                else if (s.userplatform.indexOf("legacywindowsphoneapp") >= 0)
                    u.numPhone++;
                else if (s.userplatform.indexOf("tablet") >= 0)
                    u.numTablet++;
                else
                    u.numDesktop++;
            }
        }
    })

    Object.keys(users).forEach(k => {
        var u = users[k]
        u.commScore = u.numHearts*100 + u.numRuns + u.subscribers*500
        u.normCommScore = u.commScore / (u.activedays + 1)
    })

    var labels = userFeatures.map(f => f.desc)
    var labelIdx = {}
    userFeatures.forEach(f => {
        if (f.cls) f.cls.forEach(c => {
            if (!labelIdx[c]) {
                labelIdx[c] = labels.length
                labels.push(c)
            }
        })
    })

    var recStr = []
    fs.readdirSync(args[0]).forEach((fn, i) => {
        //if (i > 100) return

        var m = /([a-z]+)\.json$/.exec(fn)
        if (!m) return
        var u = users[m[1]]
        if (!u) return

        var vec = labels.map(v => 0)
        var rawData = JSON.parse(fs.readFileSync(args[0] + "/" + fn, "utf8"))

        if (!rawData || !rawData.names) {
            console.log("cannot read " + fn)
            return
        }

        var idx = {}
        Object.keys(rawData.names).forEach(tickName => {
            var id = rawData.names[tickName]
            var buckets = []
            userFeatures.forEach((f, i) => {
                if (f.tick && tickName == "js." + f.tick) {}
                else if (f.tickRx && f.tickRx.test(tickName)) {}
                else return

                buckets.push(i)
                if (f.cls) f.cls.forEach(c => {
                    buckets.push(labelIdx[c])
                })
            })
            if (buckets.length > 0)
                idx[id] = buckets
        })

        rawData.days.forEach(d => {
            // d.time
            Object.keys(d.data).forEach(k => {
                var b = idx[k]
                if (b) {
                    var v = d.data[k]
                    b.forEach(i => {
                        vec[i] += v
                    })
                }
            })
        })

        var featureMap = {}
        labels.forEach((l, i) => featureMap[l] = vec[i])

        userFeatures.forEach((f, i) => {
            if (f.userFn)
                vec[i] = f.userFn(u, featureMap)
        })

        if (false && u.id == "wonm") {
            var obj = {}
            labels.forEach((k,i) => obj[k] = vec[i])
            console.log(obj)
        }

        u.featureVec = vec
        recStr.push(JSON.stringify(u))
    })

    fs.writeFileSync("userfeat.json", "{\"labels\":" + JSON.stringify(labels) + ",\n\"users\":[\n" + recStr.join(",\n") + "\n]}\n")
}

export function guidGen()
{
    function f() { return crypto.randomBytes(2).toString("hex").toLowerCase() }
    return f()+f()+"-"+f()+"-4"+f().slice(-3)+"-"+f()+"-"+f()+f()+f();
}

function getMime(filename:string)
{
    var ext = path.extname(filename).slice(1)
    switch (ext) {
        case "txt": return "text/plain";
        case "html":
        case "htm": return "text/html";
        case "css": return "text/css";
        case "js": return "application/javascript";
        case "jpg":
        case "jpeg": return "image/jpeg";
        case "png": return "image/png";
        case "ico": return "image/x-icon";
        case "manifest": return "text/cache-manifest";
        case "json": return "application/json";
        case "svg": return "image/svg+xml";
        case "eot": return "application/vnd.ms-fontobject";
        case "ttf": return "font/ttf";
        case "woff": return "application/font-woff";
        case "woff2": return "application/font-woff2";
        default: return "application/octet-stream";
    }
}

function uploadfile(args:string[])
{
    tdupload([args[0], "nolbl", "files"].concat(args.slice(1)))
}

function uploadwf(args:string[])
{
    var mm = /^(http.*)(\?access_token=.*)/.exec(process.env['TD_UPLOAD_KEY'])
    if (!mm) {
        console.log("invalid or missing $TD_UPLOAD_KEY")
        return
    }

    if (args.length < 2) {
        console.log("usage: uploadwf webpath filename")
        return
    }

    var liteUrl = mm[1]
    var key = mm[2]

    var content = fs.readFileSync(args[1], "utf8")
    var mime = getMime(args[1])

    var isText = /^(text\/.*|application\/(javascript|json))$/.test(mime)
    var encoding = isText ? "utf8" : "base64"
    tdevGet(liteUrl + "api/webfiles" + key, resp => {
        var rr = JSON.parse(resp)
        console.log(rr)
        if (args[2]) {
            tdevGet(liteUrl + "api/" + rr.id + "/label" + key, resp => {
                console.log(resp)
            }, 1, {
                name: args[2]
            })
        }
    }, 1, {
        encoding: "utf8",
        filename: args[0],
        contentType: mime,
        content: content,
    })
}

function copyscript(args:string[])
{
    var mm = /^(http.*)(\?access_token=.*)/.exec(process.env['TD_UPLOAD_KEY'])
    if (!mm) {
        console.log("invalid or missing $TD_UPLOAD_KEY")
        return
    }

    if (args.length < 1 || !/^http/.test(args[0])) {
        console.log("usage: copyscript https://account.blob.core.windows.net/scripttext/scriptid [baseidoverride]")
        return
    }

    
    var liteUrl = mm[1]
    var key = mm[2]

    tdevGet(args[0], resp => {
        var scr = JSON.parse(resp)
        console.log(scr)

        scr.forceid = scr.id
        if (args[1])
            scr.baseid = args[1]

        tdevGet(liteUrl + "api/scripts" + key, resp => {
            console.log(resp)
        }, 1, scr)
    })
}

function uploadhtml(args:string[])
{
    var mm = /^(http.*)(\?access_token=.*)/.exec(process.env['TD_UPLOAD_KEY'])
    if (!mm) {
        console.log("invalid or missing $TD_UPLOAD_KEY")
        return
    }

    if (args.length < 1) {
        console.log("usage: uploadhtml file.html")
        return
    }

    var text = fs.readFileSync(args[0], "utf8")

    
    var liteUrl = mm[1]
    var key = mm[2]

    tdevGet(liteUrl + "api/scripts" + key, resp => {
        console.log(resp)
    }, 1, {
        raw: "html",
        editor: "html",
        name: args[0],
        text: text,
    })
}

function tdupload(args:string[])
{
    if (process.env.TD_SOURCE_MAPS && !process.env.TRAVIS)
        console.warn("Warning: uploading a local build with source maps to the cloud: "+
                "the source maps will be useless there.");
    var key = args.shift()
    var lbl = args.shift()
    var channel = args.shift()

    if (!lbl) lbl = process.env.USERNAME

    if (!/^\d\d\d\d\d\d\d\d\d\d\d/.test(lbl))
        lbl = ((253402300799999 - Date.now()) + "0000" + "-" + guidGen().replace(/-/g, ".") + "-" + lbl).toLowerCase()

    console.log("releaseid:" + lbl)
   

    // Recursively enumerates in each entry that's a directory
    var expand = function (fileList) {
        return Array.prototype.concat.apply([],
            fileList.map(f => {
                var ext = path.extname(f);
                if (!fs.existsSync(f))
                    return [];
                else if (f == "www/blockly/blockly" || f == "www/blockly/closure-library")
                    // Checked-out git repositories
                    return [];
                else if (path.basename(f)[0] == "." || ext == ".ts" || ext == ".md")
                    // Skip .ts and .md for upload
                    return [];
                else if (fs.statSync(f).isDirectory())
                    return expand(fs.readdirSync(f).map(x => f + "/" + x));
                else
                    return [f];
            })
        )
    };

    if (args.length == 0)
        args = expand([
            "build/main.js",
            "build/main.js.map",
            "build/runtime.js",
            "build/browser.js",
            "build/browser.js.map",
            "build/noderunner.js",
            "build/noderuntime.js",
            "build/buildinfo.json",
            "build/libraries.js",
            "build/tdlibraries.js",
            "webapp/webapp.html",
            "www",
            "build/touchdevelop.tgz",
            "officemix/officemix.html",
            "build/officemix.js",
            "build/ace-main.js",
            "build/blockly-main.js",
        ])

    var liteId = ""

    var uploadFiles = () => args.forEach(p => {
        if (!fs.existsSync(p))
            return;
        var fileToRead = p.replace(/^www\//, "microbit/overrideupload/")
        if (!liteId || !/microbit/.test(liteUrl) || fileToRead == p || !fs.existsSync(fileToRead))
            fileToRead = p;
        fs.readFile(fileToRead, (err, data) => {
            if (err) {
                console.log(err)
                return
            }

            // Strip the leading directory name, unless we are uploading a single file.
            var fileName = liteId == "upload" ? p : p.split("/").splice(1).join("/")
            var mime = getMime(p)

            if (liteUrl) {
                var isText = /^(text\/.*|application\/(javascript|json))$/.test(mime)
                var encoding = isText ? "utf8" : "base64"
                var content = isText ? data.toString("utf8") : data.toString("base64")
                tdevGet(liteUrl + "api/" + liteId + "/files" + key, resp => {
                    console.log(fileName + ": " + resp)
                }, 1, {
                    encoding: encoding,
                    filename: fileName,
                    contentType: mime,
                    content: content,
                })
            }
        })
    })

    var mm = /^(http.*)(\?access_token=.*)/.exec(key)

    if (mm) {
        process.env['TD_UPLOAD_KEY'] = key
        var liteUrl = mm[1]
        key = mm[2]

        if (channel == "files") {
            liteId = "upload"
            uploadFiles()
        } else {
            tdevGet(liteUrl + "api/releases" + key, resp => {
                var d = JSON.parse(resp)
                console.log(d)
                liteId = d.id
                if (liteId) {
                    if (channel)
                        tdevGet(liteUrl + "api/" + liteId + "/label" + key, resp => {
                            console.log("channel: " + resp)
                        }, 1, { name: channel })
                    uploadFiles()
                    if (/touchdevelop/i.test(liteUrl))
                        uploadRaygunDeployment(d)
                }
            }, 1, {
                releaseid: lbl,
                commit: process.env['TRAVIS_COMMIT'],
                branch: process.env['TRAVIS_BRANCH'],
                buildnumber: process.env['TRAVIS_BUILD_NUMBER'],
            })
        }

    } else {
        uploadFiles()
    }
}

function uploadRaygunDeployment(d: {
    id: string;
    version: string;
    username: string;
}) {
    if (!process.env.RAYGUN_API_KEY
        || !process.env.RAYGUN_AUTH_TOKEN
        || process.env.TRAVIS_BRANCH != "master") return;

    console.log('creating raygun deployment');
    var body = {
        apiKey: process.env['RAYGUN_API_KEY'],
        version: d.version,
        ownerName: d.username,
        emailAddress: "build@touchdevelop.com",
        comment: d.id,
        scmIdentifier: process.env['TRAVIS_COMMIT']
    };
    console.log(JSON.stringify(body, null, 2));
    try {
        var req = https.request({
            host: 'app.raygun.io',
            path: '/deployments?authToken=' + process.env["RAYGUN_AUTH_TOKEN"],
            method: 'POST',
            headers: {
                'content-type': 'application/json; charset=utf8'
            }
        });
        req.end(JSON.stringify(body))
    } catch (e) {
        console.log(e);
    }
}

function setlabel(args:string[])
{
    var mm = /^(http.*)(\?access_token=.*)/.exec(args[0])

    if (!mm || !args[2]) return

    var liteUrl = mm[1]
    var key = mm[2]

    var liteId = args[1]
    var channel = args[2]

    tdevGet(liteUrl + "api/" + liteId + "/label" + key, resp => {
        console.log("channel: " + resp)
    }, 1, { name: channel })
}

function tdliteKey() {
    var mm = /^(http.*)(\?access_token=.*)/.exec(process.env['TD_UPLOAD_KEY'])
    if (!mm) {
        console.log("invalid or missing $TD_UPLOAD_KEY")
        process.exit(1)
    }
    return {liteUrl: mm[1], key: "&" + mm[2].slice(1)}
}

function fetchlibraries(args) {
    fetchLibs(tdliteKey(), [
        'nmhibf' // adj script
        , 'vxwcfp' // micro:bit
        , 'ldaqbf' // micro:bit game
        , 'vzkdcc' // micro:bit sprites
        , 'fdbsiw' // micro:bit serial
        , 'xnkmqj' // micro:bit senses
        , 'drdxps' // micro:bit screen
        , 'zbiwoq' // micro:bit music
       // , 'fgkphf' // micro:bit radio
        , 'lyusma' // micro:bit profile
        , 'xczaux' // blocks new
        , 'dceiba' // blocks blink
        , 'pwjcnz' // flashing heart tutorial
        , 'xyelfe' // python new
    ], "microbit/libraries", () => concatlibs());
    fetchLibs({ liteUrl: "https://www.touchdevelop.com/", key: "" }, [
        'angli' // game
    ].concat(templates.map(t => t.scriptid)), "libraries", () => {
        concattdlibs();
    });
}

function fetchLibs(k: { liteUrl: string; key: string;}, ids: string[], folder:string, onDone: () => void) {    
    var updates = {}
    var text = {}
    var json = {}
    var togo = ids.length

    console.log("fetching latest versions of " + ids.join(", "))

    ids.forEach(id =>
        tdevGet(k.liteUrl + "api/" + id + "/updates?count=1000" + k.key, resp => {
            var parsed = JSON.parse(resp)
            // TODO implement continuations
            if (parsed.continuation) throw new Error("too many!? " + id)
            parsed.items.forEach(it => {
                updates[it.id] = it.updateid
                if (it.id == it.updateid)
                    json[it.id] = it
            })
            tdevGet(k.liteUrl + "api/" + updates[id] + "/text?original=true" + k.key, t => {
                text[updates[id]] = t
                if (--togo == 0) {
                    fs.writeFileSync(folder + "/meta.json", 
                        JSON.stringify({ updates: updates, ids: ids, json: json }, null, 1))
                    ids.forEach(id =>
                        fs.writeFileSync( folder + "/" + id + ".txt", text[updates[id]]))
                    onDone()
                }
            })
        }))
}

function dlscripttext(args:string[])
{
    var files = fs.readdirSync("dl")
    var i = 0
    if (args[0])
        files = files.filter(f => f > args[0])

    var pushMode = args[1] == "push"

    var liteMode = true

    var tm0 = 1420099200 
    var start = Date.now();
    var k = tdliteKey()

    var loop = i => {
        if (!files[i]) return;
        var j = JSON.parse(fs.readFileSync("dl/" + files[i], "utf8"))
        var items = j.items.filter(it => it.time >= tm0)
        var num = 1
        var oneup = () => {
            if (--num == 0) {
                var tm = ("00000" + Math.round((Date.now() - start) / 1000)).slice(-6)
                console.log(tm, "DONE", files[i], i + "/" + files.length, items.length)
                loop(i+1)
            }
        }

        var pref = "https://www.touchdevelop.com/api/"
        var suff = ""

        if (liteMode) {
            var kk = tdliteKey();
            suff = kk.key
            pref = kk.liteUrl + "api/"
            var now = Date.now()/1000
            items = items.filter(it => it.updateid == it.id && !it.editor && now - it.time < 9*30*24*3600)
        }

        items.forEach(s => {
            ++num;
            if (pushMode) {
                fs.readFile("dls/" + s.id, "utf8", (err, dat) => {
                    if (err) {
                        console.log("ERROR", s.id, err.message)
                        oneup()
                    } else {
                        tdevGet(k.liteUrl + "api/" + s.id + "/importfixup?foo=bar" + k.key, resp => {
                            if (!/scripthash/.test(resp))
                                console.log("ERROR", s.id, resp)
                            //console.log(s.id, resp)
                            oneup()
                        }, 1, { text: dat })
                    }
                })
            } else {
                tdevGet(pref + s.id + "/text?original=true" + suff, text => {
                    if (!text) {
                        console.log("ERROR", s.id)
                        oneup()
                    } else if (liteMode || /^meta hasIds "yes"/m.test(text)) {
                        fs.writeFileSync("dls/" + s.id, text)
                        oneup()
                    } else {
                        console.log("IDS", s.id)
                        fs.writeFileSync("dls/" + s.id + ".noid", text)
                        tdevGet(pref + s.id + "/text?original=true&ids=true", text => {
                            if (!text) {
                                console.log("ERROR", s.id, "second")
                                oneup()
                            }
                            else {
                                fs.writeFileSync("dls/" + s.id, text)
                                oneup()
                            }
                        }, 5)
                    }
                }, 5)
            }
        })
        oneup()
    }

    loop(0)
}

function dllite(args:string[])
{
    var k = tdliteKey()

    var total = 0
    var store = args[0]
    var start = Date.now()

    var loop = (cont:string) =>
        tdevGet(k.liteUrl + "api/" + store + "?count=1000" + cont + k.key, resp => {
            var parsed = JSON.parse(resp)
            var fn = "dl/" + store + "-" + Date.now() + ".json"
            fs.writeFileSync(fn, JSON.stringify(parsed, null, 1))

            total += parsed.items.length

            var tm = ("00000" + Math.round((Date.now() - start) / 1000)).slice(-6)
            console.log(tm, store, 
                "total:" + total,
                parsed.continuation)

            if (parsed.continuation)
                loop("&continuation=" + parsed.continuation)
        }, 5)

    var cont = args[1] || ""
    if (cont) cont = "&continuation=" + cont
    loop(cont)
}

function countpubs(args:string[])
{
    var store = args[0]
    var cont = args[1] || ""

    var k = tdliteKey()

    var counters = {}

    var total = 0
    var totalHidden = 0

    var loop = (cont:string) =>
        tdevGet(k.liteUrl + "api/admin/countpubs/" + store + "?count=500" + cont + k.key, resp => {
            var parsed = JSON.parse(resp)

            Object.keys(parsed).forEach(k => {
                var v = parsed[k]
                if (typeof v == "number" && v > 0) {
                    k = k.replace(/Count$/, "")
                    if (!counters[k]) counters[k] = 0
                    counters[k] += v
                } else if (v !== 0) {
                    console.log("RESP", k, v)
                }
            })

            console.log(store, "total:", JSON.stringify(counters), parsed.continuation)

            if (parsed.continuation)
                loop("&continuation=" + parsed.continuation)
        }, 5)

    if (cont) cont = "&continuation=" + cont
    loop(cont)
}

function reindexone(store:string, cont = "")
{
    var k = tdliteKey()

    var total = 0
    var totalReindexed = 0

    var path = "admin/reindex/" + store
    if (/\//.test(store))
        path = store

    var loop = (cont:string) =>
        tdevGet(k.liteUrl + "api/" + path + "?count=100" + cont + k.key, resp => {
            var parsed = JSON.parse(resp)

            totalReindexed += parsed.itemsReindexed
            total += parsed.itemCount

            console.log(store, 
                "total:" + totalReindexed + "/" + total,
                "this:" + parsed.itemsReindexed + "/" + parsed.itemCount,
                "c:" + parsed.continuation)

            if (parsed.continuation)
                loop("&continuation=" + parsed.continuation)
        }, 5, {})

    if (cont) cont = "&continuation=" + cont
    loop(cont)
}

function reindexsearch(args:string[])
{
    if (args.length == 0) {
        ["script", "art", "comment", "user", "channel", "group", "pointer"].forEach(k => reindexone(k))
    } else {
        reindexone(args[0], args[1] || "")
    }
}

function importone(store:string, cont = "")
{
    var k = tdliteKey()

    var total = 0
    var total200 = 0
    var total409 = 0
    var totalErr = 0

    var start = Date.now()

    var count = /scripts|art|screenshots/.test(store) ? 100 : 500

    var loop = (cont:string) =>
        tdevGet(k.liteUrl + "api/import/" + store + "?count=" + count + cont + k.key, resp => {
            var parsed = JSON.parse(resp)

            // console.log(parsed)
            var err = "";
            var exerr = "";

            Object.keys(parsed.publications).forEach(k => {
                var n = parsed.publications[k]
                total++
                if (n == 200) total200++;
                else if (n == 409) {
                    exerr += k + ", "
                    total409++;
                } else {
                    err += k + ":" + n + ", "
                    totalErr++;
                }
            })

            if (exerr)
                console.log("EXISTS", exerr)

            if (err)
                console.log("ERROR", err)

            var tm = ("00000" + Math.round((Date.now() - start) / 1000)).slice(-6)

            console.log(tm, store, 
                total200 + "ok + " + total409 + "ex + " + totalErr + "err = " + total,
                "c:" + parsed.continuation)

            if (parsed.continuation)
                loop("&continuation=" + parsed.continuation)
        }, 5, {})

    if (cont) cont = "&continuation=" + cont
    loop(cont)
}

function importlist(args:string[])
{
    if (args.length >= 1) {
        importone(args[0], args[1] || "")
    }
}

function litepost(args:string[])
{
    var k = tdliteKey()
    var dat = args[1] ? eval("(" + args[1] + ")") : {}

    tdevGet(k.liteUrl + "api/" + args[0] + "?nothingreally=42" + k.key, resp => {
        var parsed = JSON.parse(resp)
        console.log(parsed)
    }, 5, dat)
}

function concatlibs() {
    var meta = JSON.parse(fs.readFileSync("microbit/libraries/meta.json", "utf8"))
    meta.text = {}
    meta.ids.forEach(id =>
        meta.text[meta.updates[id]] = fs.readFileSync("microbit/libraries/" + id + ".txt", "utf8"))

    var txt = "\nvar TDev; if(!TDev) TDev = {}; TDev.shippedLibraryCache = " + 
        JSON.stringify(meta, null, 1) + "\n"
    if (fs.existsSync("microbit/bytecode.js"))
        txt += fs.readFileSync("microbit/bytecode.js", "utf8")
    console.log("create micro:bit library cache file; " + txt.length + " bytes")
    fs.writeFileSync("build/libraries.js", txt)
}

function concattdlibs() {
    var meta = JSON.parse(fs.readFileSync("libraries/meta.json", "utf8"))
    meta.text = {}
    meta.ids.forEach(id =>
        meta.text[meta.updates[id]] = fs.readFileSync("libraries/" + id + ".txt", "utf8"))

    var txt = "\nvar TDev; if(!TDev) TDev = {}; TDev.shippedLibraryCache = " + 
        JSON.stringify(meta, null, 1) + ";\n"
    
    txt += "TDev.scriptTemplates = " + JSON.stringify(templates, null, 1) + ";\n";
     
    console.log("create td library cache file; " + txt.length + " bytes")
    fs.writeFileSync("build/tdlibraries.js", txt)
}

function genid()
{
    return "#id" + Math.floor(Math.random()*100000000) + " "
}

function multipartPost(uri:string, data:any, fn:string, fc:string, cb)
{
    // tried and failed to use request module...

    var boundry = "--------------------------0461489f461126c5"
    var form = ""

    function add(name:string, val:string)
    {
        form += boundry + "\r\n"
        form += "Content-Disposition: form-data; name=\"" + name + "\"\r\n\r\n"
        form += val + "\r\n"
    }

    function addF(name:string, val:string)
    {
        form += boundry + "\r\n"
        form += "Content-Disposition: form-data; name=\"files[" + name + "]\"; filename=\"blah.json\"\r\n"
        form += "\r\n"
        form += val + "\r\n"
    }

    Object.keys(data).forEach(k => add(k, data[k]))
    if (fn)
        addF(fn, fc)

    form += boundry + "--\r\n"

    var purl:any = url.parse(uri)
    purl.method = "POST"
    purl.headers = {
        "Content-Type": "multipart/form-data; boundary=" + boundry.slice(2)
    }
    var code = 0 
    var r = https.request(purl, resp => {
        code = resp.statusCode
        readRes(resp, data => {
            var s = JSON.parse(data.toString("utf8"))
            cb(code, s)
        })
    })
    r.end(form)
}

function uploadTranslation(fn:string, v:string, cb)
{
    var apiRoot = "https://api.crowdin.com/api/project/touchdevelop/"
    var suff = "?key=" + process.env.CROWDIN_KEY
    var cnt = 0

    function createDir(name:string, cb)
    {
        multipartPost(apiRoot + "add-directory" + suff, { json: "", name: name },
            null, null, (code, resp) => {
                if (code == 200) {
                    cb()
                    return
                }

                if (code == 404 && resp.error.code == 17) {
                    var par = name.replace(/\/[^\/]+$/, "")
                    if (par != name) {
                        createDir(par, () => createDir(name, cb))
                        return
                    }
                }

                console.log("Error: create dir", name, code, resp)
            })
    }

    var handler = (code, resp) => {
        if (cnt++ > 5)
            return

        if (code == 404 && resp.error.code == 8) {
            console.log("create new translation file:", fn)
            multipartPost(apiRoot + "add-file" + suff, { type: "auto", json: "" }, fn, v, handler)
        }
        else if (code == 404 && resp.error.code == 17)
            createDir(fn.replace(/\/[^\/]+$/, ""), start)
        else if (code == 200)
            cb(null)
        else {
            console.log("Error, upload translation", fn, code, resp)
        }
    }

    var start = () =>
        multipartPost(apiRoot + "update-file" + suff, { type: "auto", json: "", update_option: "update_as_unapproved" },
                        fn, v, handler)
    start()
}

function translatedoc(ids:string[])
{
    var ff = JSON.stringify({
                "str1": "Hello world how are you",
                "str2": "Something nice and something",
            })
    uploadTranslation("/bar/baz/qux/foo.json", ff, () => {})
}

var cmds = {
    "deps": { f: deps, a: "<script-file>", h: "compute and output script dependencies" },
    "parse": { f: parse, a: "<script-file>", h: "parse given file; will look for deps in the same directory" },
    "test": { f: test, a: "[id...]", h: "download given scripts, store them in cache and run parsing tests; when no ids given run tests for all stored scripts" },
    "buildtest": { f: buildtest, a: "[id...]", h: "run build tests" },
    "platform": { f: platform, a: "id", h: "compute platform capabilities for a given script" },
    "update": { f: update, a: "[N]", h: "download new interesting scripts from last N days (default 7)" },
    "tags": { f: tags, a: "[N]", h: "download top N (default 50) scripts for every tag" },
    "compile": { f: compile, a: "id", h: "write compiled script to compiled.js" },
    "optimize": { f: optimize, a: "id", h: "write optimize script to compiled.js and display statistics" },
    "docs": { f: docs, a: "id", h: "print script as docs to results.html" },
    "topic": { f: topic, a: "id", h: "print docs topic to results.html" },
    "updatelang": { f: updatelang, a: "", h: "update language cache" },
    "query": { f: query, a: "id path", h: "simulate /api/id/path" },
    "language": { f: language, a: "path", h: "simulate /api/language/path" },
    "embedwp8": { f: embedwp8, a: 'releaseId', h: "download and embed release in wp8 app" },
    "azure": { f: azure, a: 'id', h: "simulate azure parse call" },
    "art": { f: art, a: 'url', h: "download art URI" },
    "fetchhistory": { f: fetchhistory, a: 'url dir', h: 'fetch history' },
    "compresshistory": { f: compresshistory, a: 'indir outdir', h: 'convert history to JSON' },
    "fetchscriptinfo": { f: fetchscriptinfo, a: 'FILE...', h: 'fetch baseid and text fields to FILE...' },
    "getlist": { f: getlist, a: 'NAME...', h: 'fetch all NAME... to getlistdata/NAME*.json' },
    "importlite": { f: importlite, a: 'PREFIX KEY', h: 'import scripts/users/art/reviews/... to the lite cloud' },
    "getusers": { f: getusers, a: '', h: 'same as getlist users' },
    "empties": { f:empties, a:'dir', h:"remove empty sub-dirs" },
    "dlstats": { f:dlstats, a:'dir', h:"compute stats" },
    "printscript": { f:printscript, a:'id', h:'print script from cache'},
    "byruns": { f:byruns, a:'days', h:'print scripts that crashed in the last days'},
    "dlall": { f:dlall, a:'[max]', h:'download all scripts'},
    "addinfo": { f:addinfo, a:'', h:'add astinfo field to scripts.json'},
    "addinfo2": { f:addinfo2, a:'', h:'add astinfo field to withbase.json'},
    "removedups": { f:removedups, a:'[minInBucket]', h:'add astinfo field to scripts.json'},
    "addbase": { f:addbase, a:'', h:'add .baseid field to withinfo.json'},
    "addbase0": { f:addbase0, a:'', h:'add .baseid field to withinfo.json'},
    "libroots": { f:libroots, a:'', h:'generate libroots.json from scripts.json'},
    "buckethist": { f:buckethist, a:'dir', h:'generate buckethist.json'},
    "getticks": { f:getticks, a:'userid', h:'save ticks info'},
    "userfeat": { f:userfeat, a:'ticks-dir', h:'create userfeat.json'},
    "tmp0": { f:tmp0, a:'', h:'temp 0'},
    "tmp1": { f:tmp1, a:'', h:'temp 1'},
    "consolidate": { f:consolidate, a:'', h:'temp 1'},
    "counttut": { f:counttut, a:'ticks/all.json', h:'count number of started tutorials'},
    "splittexts": { f:splittexts, a:'', h:'split scripts.json into text/id'},
    "infostats": { f:infostats, a:'', h:'print out stats based on withinfo.json'},
    "addstats": { f:addstats, a:'', h:'query detailed stats'},
    "injectstats": { f:injectstats, a:'', h:'query detailed stats'},
    "tdupload": { f:tdupload, a:'KEY LABEL FILE...', h:'upload a release'},
    "fetchlibraries": { f:fetchlibraries, a:'', h:'get latest versions of libraries'},
    "concatlibs": { f:concatlibs, a:'', h:'generate build/libraries.js'},
    "concattdlibs": { f:concattdlibs, a:'', h:'generate build/tdlibraries.js'},
    "uploadfile": { f:uploadfile, a:'KEY FILE...', h:'upload a file'},
    "uploadwf": { f:uploadwf, a:'PATH FILE [LABEL]', h:'upload a webfile'},
    "dlpubs": { f:dlpubs, a:'FILE...', h:'download based on tdpublogger output'},
    "setlabel": { f:setlabel, a:'KEY RELID LABEL', h:'set release label'},
    "copyscript": { f:copyscript, a:'SCRIPTBLOBURL', h:'copy script from storage account to another'},
    "uploadhtml": { f:uploadhtml, a:'FILENAME.html', h:'upload html file as script'},
    "reindexsearch": { f:reindexsearch, a:'[store [conttok]]', h:'re-index search documents in lite cloud'},
    "importlist": { f:importlist, a:'store [conttok]', h:'import from td.com to lite cloud'},
    "litepost": { f:litepost, a:'PATH [DATA]', h:'post DATA or {} to /api/PATH'},
    "dllite": { f:dllite, a:'store [conttok]', h:'get /api/store into dl/store-*.json'},
    "dlscripttext": { f:dlscripttext, a:'[firstfile]', h:'download script text based on dl/store-*.json'},
    "countpubs": { f:countpubs, a:'store [conttok]', h:'count publications'},
    "translatedoc": {f:translatedoc, a:'id...', h:'upload doc scripts for translation in crowdin'},
}

export interface ScriptTemplate {
    title: string;
    id: string;
    //tick: Ticks; automatically generated
    icon: string;
    description: string;
    name: string;
    scriptid: string;
    section:string;
    topic?: string;
    editorMode:number; // 1 block, 2 coder, 3 expert
    source?: string; // computed
    caps?: string; // optional
    betaOnly?:boolean; // optional
}

var lf = (x:string) => x;

var sectTemplates = 'templates';
var sectBeginners = lf("beginners");
var sectCordova = lf("apps");
var sectAzure = lf("web apps");
var sectTouchDevelop = lf("touch develop");
var sectOthers = lf("others");

/*
    editorMode: 1 = block, 2 = coder, 3 = expert
*/

var templates: ScriptTemplate[] = [{
    title: lf("blank"),
    id: 'blank',
    icon: 'ABC',
    description: lf("An empty script, which doesn't do anything."),
    section: sectTemplates,
    name: 'ADJ script',
    scriptid: 'bbcka',
    editorMode: 1,
}, {
    title: lf("blank game"),
    id: 'game',
    icon: 'Controller',
    name: 'ADJ game',
    description: lf("Boiler plate code to create a game."),
    section: sectTemplates,
    scriptid: 'arqha',
    editorMode: 1,
}, {
    title: lf("blank app"),
    id: 'pages',
    icon: 'AddressBook',
    name: 'ADJ app',
    description: lf("An empty app using pages and boxes."),
    section: sectTemplates,
    scriptid: 'zkru',
    editorMode: 2,
}, {
    title: lf("blank turtle"),
    id: 'blankturtle',
    icon: 'Controller',
    name: 'ADJ turtle',
    description: lf("An turtle app."),
    section: sectBeginners,
    scriptid: 'oobxb',
    editorMode: 1,
}];

export function main()
{
    var args = process.argv.slice(2);
    if (/^http(s?):/.test(args[0])) {
        localUrl = args[0];
        args.shift();
    }
    var cmd = args.shift();

    if (cmd && cmds[cmd]) {
        var d = cmds[cmd]
        d.f(args);
    } else {
        console.log("USAGE: node build/client.js [URL] COMMAND [ARGUMENTS...]");
        console.log("URL defaults to %s", localUrl);
        console.log("Commands:");
        Object.keys(cmds).forEach((cmd) => {
            var o = cmds[cmd]
            console.log("    %s %s    %s", cmd, o.a, o.h)
        });
    }
}

main();

