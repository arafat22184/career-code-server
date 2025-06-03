const express = require("express");
const cors = require("cors");
const app = express();
const jwt = require("jsonwebtoken");
const cookieParser = require("cookie-parser");
const port = process.env.PORT || 3000;
const admin = require("firebase-admin");
const serviceAccount = require("./firebase-admin-key.json");

const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");
require("dotenv").config();

// Middleware
app.use(
  cors({
    origin: ["http://localhost:5173"], //your frontend
    credentials: true, //allow cookies
  })
);
app.use(express.json());
app.use(cookieParser());

// Firebase verification JWT

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
});

// VERIFY FIREBASE TOKEN
const verifyFirebaseToken = async (req, res, next) => {
  const authHeader = req?.headers?.authorization;
  const token = authHeader.split(" ")[1];

  if (!token) {
    return res.status(401).send({ message: "unauthorized access" });
  }

  try {
    const decoded = await admin.auth().verifyIdToken(token);

    req.decoded = decoded;
    next();
  } catch (error) {
    return res.status(401).send({ message: "unauthorized access" });
  }
};

const verifyTokenEmail = (req, res, next) => {
  if (req.query.email !== req.decoded.email) {
    return res.status(403).send({ message: "forbidden access" });
  }
  next();
};

const verifyToken = (req, res, next) => {
  const token = req?.cookies?.token;

  // check token exists or not
  if (!token) {
    return res.status(401).send({ message: "unauthorized access" });
  }

  // verify token
  jwt.verify(token, process.env.JWT_ACCESS_SECRET, (err, decoded) => {
    if (err) {
      return res.status(401).send({ message: "unauthorized access" });
    }

    req.decoded = decoded;

    next();
  });
};

app.get("/", (req, res) => {
  res.send("Career Code Cooking");
});

const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.ydu4ilk.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0`;

// Create a MongoClient with a MongoClientOptions object to set the Stable API version
const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  },
});

async function run() {
  try {
    // Connect the client to the server	(optional starting in v4.7)
    await client.connect();

    const jobsCollection = client.db("careerCode").collection("jobs");
    const applicationCollection = client
      .db("careerCode")
      .collection("applicatons");

    // JWT token related Api

    // HTTP COOKIE ONLY
    app.post("/jwt", async (req, res) => {
      const userData = req.body;

      const token = jwt.sign(userData, process.env.JWT_ACCESS_SECRET, {
        expiresIn: "1d",
      });

      // Set token in the Cookies
      res.cookie("token", token, {
        httpOnly: true,
        secure: false,
      });

      res.send({ success: true });
    });

    // Local storage way
    // app.post("/jwt", async (req, res) => {
    //   const { email } = req.body;
    //   const user = { email };

    //   const token = jwt.sign(user, process.env.JWT_ACCESS_SECRET, {
    //     expiresIn: "1h",
    //   });

    //   res.send({ token });
    // });

    // JOBS API
    app.get("/jobs", async (req, res) => {
      const email = req.query.email;

      const query = {};
      if (email) {
        query.hr_email = email;
      }

      const cursor = jobsCollection.find(query);
      const result = await cursor.toArray();
      res.send(result);
    });

    // Could be done but should not be done
    // app.get("/jobsByEmailAddress", async (req, res) => {
    //   const email = req.query.email;
    //   const query = { hr_email: email };
    //   const result = await jobsCollection.find(query).toArray();
    //   res.send(result);
    // });

    app.get(
      "/jobs/applications",
      verifyFirebaseToken,
      verifyTokenEmail,
      async (req, res) => {
        const email = req.query.email;

        const query = { hr_email: email };
        const jobs = await jobsCollection.find(query).toArray();

        // Should use aggregate to have optimum data fetching
        for (const job of jobs) {
          const applicationQuery = { jobId: job._id.toString() };
          const application_count = await applicationCollection.countDocuments(
            applicationQuery
          );
          job.application_count = application_count;
        }
        res.send(jobs);
      }
    );

    app.get("/jobs/:id", async (req, res) => {
      const id = req.params.id;
      const query = { _id: new ObjectId(id) };
      const result = await jobsCollection.findOne(query);
      res.send(result);
    });

    app.post("/jobs", async (req, res) => {
      const newJob = req.body;
      const result = await jobsCollection.insertOne(newJob);
      res.send(result);
    });

    // Job applications related API's

    app.post("/applications", async (req, res) => {
      const application = req.body;
      const result = await applicationCollection.insertOne(application);
      res.send(result);
    });

    app.get(
      "/applications",
      verifyFirebaseToken,
      verifyTokenEmail,
      async (req, res) => {
        const email = req.query.email;

        // VerifyToken http cookie
        // http cookie check decoded email and user email same or not
        // if (email !== req.decoded.email) {
        //   return res.status(403).send({ message: "forbidden access" });
        // }

        const query = { applicant: email };
        const result = await applicationCollection.find(query).toArray();

        // Bad way to aggregate Data
        for (const application of result) {
          const jobId = application.jobId;
          const jobQuery = { _id: new ObjectId(jobId) };
          const job = await jobsCollection.findOne(jobQuery);
          application.company = job.company;
          application.title = job.title;
          application.company_logo = job.company_logo;
        }

        res.send(result);
      }
    );

    app.get("/applications/job/:id", async (req, res) => {
      const id = req.params.id;
      const query = { jobId: id };
      const result = await applicationCollection.find(query).toArray();
      res.send(result);
    });

    app.patch("/applications/:id", async (req, res) => {
      const filter = { _id: new ObjectId(req.params.id) };
      const updatedDoc = {
        $set: {
          status: req.body.status,
        },
      };

      const result = await applicationCollection.updateOne(filter, updatedDoc);
      res.send(result);
    });

    // Send a ping to confirm a successful connection
    await client.db("admin").command({ ping: 1 });
    console.log(
      "Pinged your deployment. You successfully connected to MongoDB!"
    );
  } finally {
    // Ensures that the client will close when you finish/error
    // await client.close();
  }
}
run().catch(console.dir);

app.listen(port, () => {
  console.log(`Career code running on port ${port}`);
});
