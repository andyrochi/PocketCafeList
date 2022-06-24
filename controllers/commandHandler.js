const db = require('../db');
const dataJson = require('../data/data.json');
const { UserManager, UserInfo } = require('./userManager');
const templates = require('../data/templates.json');
const { client } = require('../index');
const Mustache = require("mustache");

// Disable excape
Mustache.escape = function(text) {return text;};

const manager = new UserManager();

/*
    Handles commands and maintains each user's history.
*/
async function commandHandler(event) {
    const eventSource = event.source;
    const eventMessage = event.message;

    const user = await handleUser(eventSource);
    const userId = user.userId;
    let response = defaultMessage();

    if (event.type === 'postback') {
        console.log(event.postback?.data)
        const postback_data = event.postback?.data
        if (postback_data === undefined) return response
        const res = postback_data.split("=")
        const mode = res[0], id = res[1]
        const date = new Date()
        if (mode === 'save') {
            const query = 
                `INSERT INTO "saved_location"(userid, id, add_date)
                VALUES($1, $2, $3)
                ON CONFLICT DO NOTHING`;
            const params = [userId, id, date];
            await db.query(query,params).then((res) => {
                console.log('Insert status:', res.rowCount)
                if (res.rowCount === 1) {
                    response = textMessage("地點儲存成功！")
                }
                else {
                    response = textMessage("之前已經存過了喔！")
                }
            }).catch(e => {
                console.error(e.stack)
            })
        }
        else if (mode === 'delete') {
            const query =
                `DELETE FROM saved_location
                WHERE userid = $1 AND id = $2`;
            const params = [userId, id];
            await db.query(query,params).then((res) => {
                console.log('Insert status:', res.rowCount)
                if (res.rowCount === 1) {
                    response = textMessage("已刪除地點！")
                }
                else {
                    response = textMessage("地點已經被刪除過了喔！")
                }
            }).catch(e => {
                console.error(e.stack)
            })
        }
    }
    // Handle text message based on text
    else if (eventMessage.type === 'text') {
        const command = eventMessage.text;
        if (command in dataJson) {
            if (dataJson[command] === 'back') {
                user.popHistory();
                const lastCommand = user.getLastMessage();
                response = dataJson[lastCommand];
            } else {
                response = dataJson[command];
                // to constant input of identical commands
                if (command !== user.getLastMessage())
                    user.saveHistory(command);
            }
        }
        else if (command === '我的清單') {
            const query = `
                WITH saved AS
                    (SELECT *
                    FROM "saved_location"
                    WHERE userid = $1)
                    SELECT *
                FROM saved NATURAL JOIN cafe`;
            const params = [userId];
            await db.query(query, params).then((res) => {
                const rows = res.rows;
                let text = '';
                response = [];
                const carousel = createCarousel("這是您已儲存的店家");
                if (rows.length > 0) {
                    text = `${user.displayName}，這是您已儲存的店家：`
                    response.push(addQuickReply(textMessage(text)))
                    rows.forEach((row)=>{
                        const card = createSavedLocation(row)
                        carousel['contents']['contents'].push(card)
                    })
                    response.push(addQuickReply(carousel))
                }
                else {
                    text = '您尚未儲存咖啡廳，趕快來尋找吧！'
                    response.push(addQuickReply(textMessage(text)))
                }
            })
        }
    }
    // If location is given, find nearest 5 cafe according to given location
    else if (eventMessage.type === 'location') {
        const {latitude, longitude} = eventMessage
        const coordinates = [latitude, longitude]
        const query = 
            `SELECT id, 
                    name,
                    address, 
                    open_time, 
                    url, 
                    latitude::float, 
                    longitude::float, 
                    calculate_distance($1, $2, latitude, longitude, 'K') as distance
             FROM cafe
             ORDER BY distance
             limit 5`;
        
        await db.query(query, coordinates).then(res => {
            const carousel = createCarousel()
            res.rows.forEach((row) => {
                const card = createLocation(row)
                carousel['contents']['contents'].push(card)
            })
            response = carousel
        }).catch(e => {
            console.error(e.stack)
        })
    }
    else {
        if ('home' !== user.getLastMessage())
            user.saveHistory('home');
    }
    response = addQuickReply(response);
    return response;
}

/*
    Check if user is in userManager, if not, add new user.
    Returns the userInfo.
*/
async function handleUser(eventSource) {
    const userId = eventSource.userId;
    let user = manager.getUser(userId);
    if(user === null) {
        // Obtain displayName
        let displayName = '';
        await client.getProfile(userId)
            .then((profile) => {
                displayName = profile.displayName;
            })
        user = manager.insertUser(new UserInfo(userId, displayName));
        const params = [userId, displayName];
        const query = 
            `INSERT INTO "user"(userid, displayname)
            VALUES($1, $2)
            ON CONFLICT(userid) DO NOTHING`;
        // query database
        await db.query(query,params).then((res) => {
            console.log('Insert status:', res.rowCount)
        }).catch(e => {
            console.error(e.stack)
        })
    }
    
    return user;
}

function defaultMessage() {
    return dataJson['home'];
}

// Create location card
function createLocation(row) {
    const dist = Math.round(row.distance * 1000)
    const id = row.id
    const data = {
        locationName: row.name,
        distance: dist,
        address: row.address,
        nomadUrl: `https://cafenomad.tw/shop/${id}`,
        id: row.id
    }
    const rendered = Mustache.render(JSON.stringify(templates['location_card']), data)
    const card = JSON.parse(rendered)
    card["footer"]["contents"][1] = getOfficialWebsite(row.url)
    return card
}

function createSavedLocation(row) {
    const date = new Date(row.add_date)
    const options = {year: 'numeric', month: 'long', day: 'numeric' }
    const data = {
        locationName: row.name,
        addDate: date.toLocaleDateString('zh-TW', options),
        address: row.address,
        nomadUrl: `https://cafenomad.tw/shop/${row.id}`,
        id: row.id,
        city: dataJson.cities[row.city]
    }
    const rendered = Mustache.render(JSON.stringify(templates['saved_location_card']), data)
    const card = JSON.parse(rendered)
    card["footer"]["contents"][1] = getOfficialWebsite(row.url)
    return card
}

// Create carousel
function createCarousel(altText="這是附近的咖啡廳！") {
    return {
        "type":"flex",
        "altText":altText,
        "contents": {
            "type": "carousel",
            "contents": []
        }
    }
}

// Create official site button
function getOfficialWebsite(url) {
    let officialSiteBtn =  {
        "type": "button",
        "style": "link",
        "height": "sm",
        "action": {
            "type": "message",
            "label": "Official Site",
            "text": "本店尚無官方網站"
        },
        "color": "#aaaaaa"
    }

    if (url !== null) {
        // prepend http to url to prevent error
        if (!/^https?:\/\//i.test(url)) {
            url = 'http://' + url;
        }
        officialSiteBtn = {
            "type": "button",
            "style": "link",
            "height": "sm",
            "action": {
              "type": "uri",
              "label": "Official Site",
              "uri": url
            },
            "color": "#49281A"
        }
    }

    return officialSiteBtn
}

function textMessage(text) {
    return {
        "type": "text",
        "text": text
    }
}

function addQuickReply(msg) {
    if (typeof msg !== Array) {
        msg.quickReply = templates.quickReply;
    }
    else {
        msg[msg.length-1].quickReply = templates.quickReply;
    }
    return msg;
}

exports.commandHandler = commandHandler;