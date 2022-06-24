const db = require('../db');

async function getUserList(userId) {

    // check if user exists
    const query = 
        `SELECT * FROM "user" WHERE userid = $1`
    const param = [userId]
    let result = 1;
    await db.query(query, param).then((res)=>{
        if(res.rows.length === 0) {
            result= -1;
        }
        
    })
    .catch(err=> console.error(err.stack))
    if(result===-1) return false;


    // fetch rows
    const db_query = 
    `WITH saved AS
        (SELECT *
        FROM "saved_location"
        WHERE userid = $1)
    SELECT *
    FROM saved NATURAL JOIN cafe`
    await db.query(db_query, param).then((res)=>{
        result = res.rows;
    }).catch(err=> console.error(err.stack))

    return result;
}

async function getUserInfo(userId) {
    const query = 
     `SELECT * FROM "user" WHERE userid = $1`
    const param = [userId]
    let result = null;
    await db.query(query, param).then((res)=>{
        if(res.rows.length !== 0) {
            result = res.rows[0];
        }
    })
    .catch(err=> console.error(err.stack))
    return result;
}

module.exports = {
    getUserList: getUserList,
    getUserInfo: getUserInfo
}