const express = require('express');
const cors = require('cors');
const jwt = require('jsonwebtoken');
const cookieParser = require('cookie-parser');
const port = process.env.PORT || 5000;
const app = express();
const { MongoClient, ServerApiVersion } = require('mongodb');
require('dotenv').config();
app.use(cors({
    origin: [
        'http://localhost:5173',
    ],
    credentials: true
}));
app.use(express.json());
app.use(cookieParser());
const verifyToken = (req, res, next) => {
    const token = req.cookies?.token;

    if (!token) {
        return res.status(401).send({ message: 'unauthorized access' });
    }
    jwt.verify(token, process.env.ACCESS_TOKEN_SECRET, (err, decoded) => {
        if (err) {
            return res.status(401).send({ message: 'unauthorized access' });
        }
        req.user = decoded;
        next();
    })
}
const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.rw4nz.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0`;

// Create a MongoClient with a MongoClientOptions object to set the Stable API version
const client = new MongoClient(uri, {
    serverApi: {
        version: ServerApiVersion.v1,
        strict: true,
        deprecationErrors: true,
    }
});

async function run() {
    try {
        // Connect the client to the server	(optional starting in v4.7)
        await client.connect();
        // Send a ping to confirm a successful connection
        await client.db("admin").command({ ping: 1 });
        console.log("Pinged your deployment. You successfully connected to MongoDB!");
        const booksCollection = client.db('libraryManagement').collection('books');

        app.post('/jwt', async (req, res) => {
            try {
                const user = req.body;
                const token = jwt.sign(user, process.env.ACCESS_TOKEN_SECRET, { expiresIn: '6h' });

                res.cookie('token', token, {
                    httpOnly: true,
                    secure: false,
                }).send({ success: true });
            } catch (error) {
                console.error('Error generating token:', error);
                res.status(500).send({ success: false, message: 'Token generation failed' });
            }
        });
        app.post('/logout', (req, res) => {
            try {
                res.clearCookie('token', {
                    httpOnly: true,
                    secure: false,
                }).send({ success: true });
            } catch (error) {
                console.error('Error during logout:', error);
                res.status(500).send({ success: false, message: 'Logout failed' });
            }
        });
        app.post('/books', async (req, res) => {
            try {
                const { name, quantity, authorName, category, shortDescription, rating, image } = req.body;
                if (!name || !authorName || !category || !rating || !image) {
                    return res.status(400).send({ success: false, message: 'Missing required fields' });
                }

                const newBook = {
                    name,
                    quantity: Number(quantity) || 0,
                    authorName,
                    category,
                    shortDescription,
                    rating: Number(rating),
                    image,
                    createdAt: new Date(),
                };

                const result = await booksCollection.insertOne(newBook);
                res.send({ success: true, message: 'Book added successfully', data: result });
            } catch (error) {
                console.error(error);
                res.status(500).send({ success: false, message: 'Internal Server Error' });
            }
        });
        app.get('/books', async (req, res) => {
            try {
                const books = await booksCollection.find().toArray();
                res.send(books);
            } catch (error) {
                console.error(error);
                res.status(500).send({ success: false, message: 'Internal Server Error' });
            }
        });
    } finally {
        // Ensures that the client will close when you finish/error
        // await client.close();
    }
}
run().catch(console.dir);

app.get('/', (req, res) => {
    res.send('library management server is running')
})

app.listen(port, () => {
    console.log(`library is navigating in port: ${port}`);
})