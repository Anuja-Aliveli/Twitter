const express = require("express");
const path = require("path");
const {open} = require("sqlite");
const sqlite3 = require("sqlite3");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");

const app = express();
app.use(express.json());
const dbPath = path.join(__dirname, "twitterClone.db");
let db = null;

// Server and db
const initializeAndConnect = async () => {
    try {
        db = await open({
            filename: dbPath,
            driver: sqlite3.Database,
        });
        app.listen(3000, () => {
            console.log("server running at port 3000");
            console.log("Database sqlite connected...");
        });
    }
    catch (err) {
        console.log(`Db err ${err.message}`);
        process.exit(1);
    }
}
initializeAndConnect();

// authenticate
const authenticateToken = (request, response, next) => {
  let jwtToken;
  const authHeader = request.headers["authorization"];
  if (authHeader !== undefined) {
    jwtToken = authHeader.split(" ")[1];
  }
  if (jwtToken === undefined) {
    response.status(401);
    response.send("Invalid JWT Token");
  } else {
    jwt.verify(jwtToken, "MY_SECRET_TOKEN", async (error, payload) => {
      if (error) {
        response.status(401);
        response.send("Invalid JWT Token");
      } else {
        request.username = payload.username;
        next();
      }
    });
  }
};

const convertDate = (arrayDetails) => {
    const dateTime = arrayDetails.date_time;
    delete arrayDetails.date_time;
    arrayDetails.dateTime = dateTime;
    return {arrayDetails};
};

// API 1 register
app.post("/register/", async(request, response) => {
    const registerDetails = request.body;
    const { username, password, name, gender } = registerDetails;
    const checkUser = `select * from user where username = '${username}';`;
    const checkResponse = await db.get(checkUser);
    if(checkResponse !== undefined) {
        response.status(400);
        response.send("User already exists");
    } else {
        if(password.length < 6) {
            response.status(400);
            response.send("Password is too short");
        } else {
            const hashedPassword = await bcrypt.hash(password,10);
            const query1 = `insert into user(username,name,password,gender)
            values('${username}', '${name}', '${hashedPassword}', '${gender}');`;
            const responseQuery1 = await db.run(query1);
            response.status(200);
            response.send("User created successfully");
        }
    }
});

// API 2 login 
app.post("/login/", async (request, response) => {
  const { username, password } = request.body;
  const selectUserQuery = `SELECT * FROM user WHERE username = '${username}';`;
  const dbUser = await db.get(selectUserQuery);
  if (dbUser === undefined) {
    response.status(400);
    response.send("Invalid user");
  } else {
    const isPasswordMatched = await bcrypt.compare(password, dbUser.password);
    if (isPasswordMatched === true) {
      const payload = {
        username: username,
      };
      const jwtToken = jwt.sign(payload, "MY_SECRET_TOKEN");
      response.send({ jwtToken });
    } else {
      response.status(400);
      response.send("Invalid password");
    }
  }
});

// API 3 
app.get("/user/tweets/feed/", authenticateToken, async(request, response) => {
    const {username} = request;
    const user = `select user_id from user where username = '${username}';`;
    const userId = await db.get(user);
    const query3 = `select username, tweet, date_time as dateTime
                    from user natural join follower natural join tweet
                    where follower.follower_user_id = ${userId.user_id} and 
                    follower.following_user_id = tweet.user_id
                    order by tweet_id limit 4;`;
    const responseQuery3 = await db.all(query3);
    response.send(responseQuery3); 
});

// API 4
app.get("/user/following/", authenticateToken, async(request, response) => {
    const {username} = request;
    const user = `select user_id from user where username = '${username}';`;
    const userId = await db.get(user);
    const query4 = `select username as name
                    from user natural join follower 
                    where follower.follower_user_id = ${userId.user_id}
                    and follower.following_user_id = user.user_id;`;
    const responseQuery4 = await db.all(query4);
    response.send(responseQuery4);
});

// API 5 
app.get("/user/followers/", authenticateToken, async(request, response) => {
    const {username} = request;
    const user = `select user_id from user where username = '${username}';`;
    const userId = await db.get(user);
    const query5 = `select username as name 
                    from user natural join follower 
                    where follower.following_user_id = ${userId.user_id}
                    and follower.follower_user_id = user.user_id;`;
    const responseQuery5 = await db.all(query5);
    response.send(responseQuery5);
});

// API 6
app.get("/tweets/:tweetId/", authenticateToken, async(request, response) => {
    const { tweetId } = request.params;
    const {username} = request;
    const user = `select user_id from user where username = '${username}';`;
    const userId = await db.get(user);

    const likes = `select count(tweet_id) as likes from like where tweet_id = ${tweetId};`;
    const likesCount = await db.get(likes);
    const replies = `select count(tweet_id) as replies from reply where tweet_id = ${tweetId};`;
    const repliesCount = await db.get(replies);

    const query6 = `select tweet, date_time as dateTime from tweet natural join follower
                    where follower.follower_user_id = ${userId.user_id} and 
                    follower.following_user_id = tweet.user_id and tweet.tweet_id = ${tweetId};`;
    try {
        const responseQuery6 = await db.get(query6);
         response.send({
            tweet: responseQuery6.tweet,
            likes: likesCount.likes,
            replies: repliesCount.replies,
            dateTime: responseQuery6.dateTime
        });        
    } catch(err) {
        response.status(401);
        response.send("Invalid Request");
    }
});

// API 7 
app.get("/tweets/:tweetId/likes/", authenticateToken, async(request, response) => {
    const {tweetId} = request.params;
    const {username} = request;
    const user = `select user_id from user where username = '${username}';`;
    const userId = await db.get(user);

    const getIds = `select tweet_id as id from follower join tweet
                    where follower_user_id = ${userId.user_id} and 
                    follower.following_user_id = tweet.user_id;`;
    const responseGetId = await db.all(getIds);
    let idArray = [];
    for(let each of responseGetId) {
        idArray.push(each.id);
    }
    if(idArray.includes(parseInt(tweetId)) === false) {
        response.status(401);
        response.send("Invalid Request");
    } else {
        const query7 = `select distinct(username) from user natural join like 
                    natural join follower where user.user_id = like.user_id 
                    and follower.follower_user_id = ${userId.user_id} 
                    and like.tweet_id = ${tweetId}`;
        const responseQuery7 = await db.all(query7);
        let likes = [];
        for(let each of responseQuery7) {
            likes.push(each.username);
        }
        response.send({likes});
    }
});

// API 8 
app.get("/tweets/:tweetId/replies/", authenticateToken, async(request, response) => {
    const {tweetId} = request.params;
    const {username} = request;
    const user = `select user_id from user where username = '${username}';`;
    const userId = await db.get(user);

    const getIds = `select tweet_id as id from follower join tweet
                    where follower_user_id = ${userId.user_id} and 
                    follower.following_user_id = tweet.user_id;`;
    const responseGetId = await db.all(getIds);
    let idArray = [];
    for(let each of responseGetId) {
        idArray.push(each.id);
    }
    console.log(idArray);
    if(idArray.includes(parseInt(tweetId)) === false) {
        response.status(401);
        response.send("Invalid Request");
    } else {
        const query8 = `select username as name, reply from 
                        user join reply on user.user_id = reply.user_id
                        where tweet_id = ${tweetId};`;
        const repliesArray = await db.all(query8);
        //const getTweet = `select tweet from tweet where tweet_id = ${tweetId};`;
        //const tweet = await db.get(getTweet);
        response.send({
            replies: repliesArray
        });
    }
});

// API 9 
app.get("/user/tweets/", authenticateToken, async(request, response) => {
    const {username} = request;
    const user = `select user_id from user where username = '${username}';`;
    const userId = await db.get(user);

    const getTwtIds = `select tweet_id as id from tweet where 
                    tweet.user_id = ${userId.user_id};`;
    const twtIds = await db.all(getTwtIds);
    let result = [];
    for(let each of twtIds) {
        const query9 = `select tweet,
        (select count(*) from like where tweet_id = ${each.id}) as likes,
        (select count(*) from reply where tweet_id = ${each.id}) as replies,
        date_time as dateTime 
        from tweet where tweet.tweet_id = ${each.id};`;
        const responseQuery9 = await db.all(query9);
        result.push(responseQuery9[0]);
    }
    response.send(result);
});

// API 10 
app.post("/user/tweets/", authenticateToken, async(request, response) => {
    const {username} = request;
    const user = `select user_id from user where username = '${username}';`;
    const userId = await db.get(user);

    const postDetails = request.body;
    const {tweet} = postDetails;
    const query10 = `insert into tweet(tweet, user_id) values
                    ('${tweet}',${userId.user_id});`;
    const responseQuery10 = await db.run(query10);
    response.send("Created a Tweet");
});

// API 11
app.delete("/tweets/:tweetId/", authenticateToken, async(request, response) => {
    const { tweetId } = request.params;
     const {username} = request;
    const user = `select user_id from user where username = '${username}';`;
    const userId = await db.get(user);
    const selectQuery = `select tweet_id as id from tweet 
                        where user_id = ${userId.user_id};`;
    const responseQuery = await db.all(selectQuery);
    let array = [];
    for(let each of responseQuery) {
        array.push(each.id);
    }
    if(array.includes(parseInt(tweetId)) === false) {
        response.status(401);
        response.send("Invalid Request");
    } else {
        const query11 = `delete from tweet where tweet_id = ${tweetId};`;
        await db.run(query11);
        response.send("Tweet Removed");
    }
});

module.exports = app;