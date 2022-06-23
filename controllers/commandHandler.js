const db = require('../db');
const data = require('../data/data.json');
const { UserManager, UserInfo } = require('./userManager');
const templates = require('../data/templates.json');
const { client } = require('../index');

const manager = new UserManager();

/*
    Handles commands and maintains each user's history.
*/
async function commandHandler(eventSource, eventMessage) {
    const user = await handleUser(eventSource);
    let response = defaultMessage();
    // Handle text message based on text
    if (eventMessage.type === 'text') {
        const command = eventMessage.text;
        if (command in data) {
            if (data[command] === 'back') {
                user.popHistory();
                const lastCommand = user.getLastMessage();
                response = data[lastCommand];
            } else {
                response = data[command];
                // to constant input of identical commands
                if (command !== user.getLastMessage())
                    user.saveHistory(command);
            }
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
             FROM mytable
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
        manager.insertUser(new UserInfo(userId, displayName));
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
    return data['home'];
}

// Create location card
function createLocation(row) {
    const card = JSON.parse(JSON.stringify(templates['location_card']))
    const dist = Math.round(row.distance * 1000)
    const id = row.id
    card["body"]["contents"][0]["text"] = row.name
    card["body"]["contents"][1]["text"] = `${dist} 公尺`
    card["body"]["contents"][2]["contents"][0]["contents"][1]["text"] = row.address
    card["footer"]["contents"][0]["action"]["uri"] = `https://cafenomad.tw/shop/${id}`
    card["footer"]["contents"][1] = getOfficialWebsite(row.url)
    return card
}

// Create carousel
function createCarousel() {
    return {
        "type":"flex",
        "altText":"這是這附近的咖啡廳!",
        "contents": {
            "type": "carousel",
            "contents": []
        },
        "quickReply": { 
            "items": [
                {
                "type": "action",
                "action": {
                    "type": "location",
                    "label": "尋找附近的咖啡廳吧！"
                }
                }
            ]
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
        }
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
            }
        }
    }

    return officialSiteBtn
}

exports.commandHandler = commandHandler;