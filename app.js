const express = require("express");
const { open } = require("sqlite");
const sqlite3 = require("sqlite3");
const path = require("path");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");

const dbPath = path.join(__dirname, "covid19IndiaPortal.db");

const app = express();

app.use(express.json());

let db = null;

const initializeDbAndServer = async () => {
  try {
    db = await open({
      filename: dbPath,
      driver: sqlite3.Database,
    });

    app.listen(3000, () =>
      console.log("Server Running at http://localhost:3000/")
    );
  } catch (error) {
    console.log(`DB Error: ${error.message}`);
    process.exit(1);
  }
};

initializeDbAndServer();

/* signup user 
if user exists it will send response that user already exits
if not sending response Created new user with id and username is username*/

app.post("/signupUser/", async (request, response) => {
  const { username, name, password, gender, location } = request.body;
  const hashedPassword = await bcrypt.hash(request.body.password, 10);
  const selectUser = `SELECT * FROM user WHERE username = '${username}'`;
  const dbUser = await db.get(selectUser);
  if (dbUser === undefined) {
    const createUser = `
      INSERT INTO 
        user (username, name, password, gender, location) 
      VALUES 
        (
          '${username}', 
          '${name}',
          '${hashedPassword}', 
          '${gender}',
          '${location}'
        )`;
    const dbResponse = await db.run(createUser);
    const newUserId = dbResponse.lastID;
    response.send(
      `Created new user with ${newUserId} and username is ${username}`
    );
  } else {
    response.status = 400;
    response.send("Username already exists");
  }
});

/*login the user and get jwt token 
if user not exits sending response you're not registered
if password is incorrect sending response Invalid password*/

app.post("/login/", async (request, response) => {
  const { username, password } = request.body;
  const selectUser = `SELECT * FROM user WHERE username = '${username}';`;
  const dbUser = await db.get(selectUser);
  if (dbUser === undefined) {
    response.status(400);
    response.send("you're not registered");
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

// Middleware Function it is used for authorization access the data

function authenticateToken(request, response, next) {
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
        next();
      }
    });
  }
}

// total cured cases in India

app.get("/cured/", authenticateToken, async (request, response) => {
  const getStates = `
    SELECT
      SUM(cured) AS totalCuredCases
    FROM
      district;`;
  const array = await db.get(getStates);
  response.send(array);
});

//total cases in India

app.get("/totalCases/", authenticateToken, async (request, response) => {
  const getStates = `
    SELECT
      SUM(cases) AS totalCases
    FROM
      district;`;
  const array = await db.get(getStates);
  response.send(array);
});

//total active Cases in India

app.get("/activeCases/", authenticateToken, async (request, response) => {
  const getStates = `
    SELECT
      SUM(active) AS activeCases
    FROM
      district;`;
  const array = await db.get(getStates);
  response.send(array);
});

/*get the data of selected type of cases select=(cured,active,cases) 
we can get which state has orderby=DESC(top cases) and ASC(least cases)
we can set limit and offset*/

app.get("/selected/", authenticateToken, async (request, response) => {
  const {
    offset = 2,
    limit = 10,
    order = "ASC",
    select = "active",
  } = request.query;
  const getSelected = `
    SELECT
      state.state_name,SUM(${select}) as total${select}
    FROM
      state INNER JOIN district ON state.state_id=district.state_id
   GROUP BY
        state.state_id
    ORDER BY total${select} ${order}
    LIMIT ${limit} OFFSET ${offset};`;
  const selectedCases = await db.all(getSelected);
  response.send(selectedCases);
});

//searching states by sending request through body

app.get("/searchStates/", authenticateToken, async (request, response) => {
  const { stateName } = request.body;
  const getStates = `
    SELECT
      state.state_name AS stateName,SUM(cured) AS curedCases,SUM(active) AS activeCases,SUM(cases) AS totalCases
    FROM
      state INNER JOIN district ON state.state_id=district.state_id
    WHERE state.state_name like '%${stateName}%'
   GROUP BY
        state.state_id
    ORDER BY stateName DESC;`;
  const array = await db.all(getStates);
  response.send(array);
});

//searching district by sending request through body

app.get("/searchDistrict/", authenticateToken, async (request, response) => {
  const { districtName } = request.body;
  const getStates = `
    SELECT
      district.district_name AS districtName,state.state_name AS stateName,SUM(cured) AS curedCases,SUM(active) AS activeCases,SUM(cases) AS totalCases
    FROM
      state INNER JOIN district ON state.state_id=district.state_id
    WHERE district.district_name like '%${districtName}%'
   GROUP BY
        state.state_id
    ORDER BY stateName DESC;`;
  const array = await db.all(getStates);
  response.send(array);
});

/*get the data of state from stateId 
get stateId from parameters */
app.get("/states/:stateId/", authenticateToken, async (request, response) => {
  const { stateId } = request.params;
  const getStateById = `
     SELECT
      state.state_name AS stateName,SUM(cured) AS curedCases,SUM(active) AS activeCases,SUM(cases) AS totalCases
    FROM
      state INNER JOIN district ON state.state_id=district.state_id
    WHERE state.state_id=${stateId};`;
  const state = await db.get(getStateById);
  response.send(state);
});

module.exports = app;
