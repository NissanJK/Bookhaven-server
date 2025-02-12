const express = require('express');
const cors = require('cors');
const jwt = require('jsonwebtoken');
const cookieParser = require('cookie-parser');
const port = process.env.PORT || 5000;
const app = express();
const { MongoClient, ServerApiVersion } = require('mongodb');
const { ObjectId } = require('mongodb');
require('dotenv').config();
app.use(cors({
    origin: [
        'http://localhost:5173',
        'https://bookhaven-f4847.web.app',
        'https://bookhaven-f4847.firebaseapp.com',
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
        // await client.connect();
        // Send a ping to confirm a successful connection
        // await client.db("admin").command({ ping: 1 });
        // console.log("Pinged your deployment. You successfully connected to MongoDB!");
        const booksCollection = client.db('libraryManagement').collection('books');
        const borrowCollection = client.db('libraryManagement').collection('borrowedBooks');
        app.post('/jwt', async (req, res) => {
            try {
                const user = req.body;
                const token = jwt.sign(user, process.env.ACCESS_TOKEN_SECRET, { expiresIn: '6h' });

                res.cookie('token', token, {
                    httpOnly: true,
                    secure: process.env.NODE_ENV === 'production',
                    sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'strict'
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
                    secure: process.env.NODE_ENV === 'production',
                    sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'strict'
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

        app.get('/books/:id', async (req, res) => {
            try {
                const { id } = req.params;
                const book = await booksCollection.findOne({ _id: new ObjectId(id) });

                if (!book) {
                    return res.status(404).send({ success: false, message: 'Book not found' });
                }

                res.send(book);
            } catch (error) {
                console.error(error);
                res.status(500).send({ success: false, message: 'Internal Server Error' });
            }
        });

        app.put('/books/:id', verifyToken, async (req, res) => {
            try {
                const { id } = req.params;
                const { name, authorName, category, rating, image } = req.body;

                if (!name || !authorName || !category || !rating || !image) {
                    return res.status(400).send({ success: false, message: 'Missing required fields' });
                }

                const updatedBook = {
                    $set: {
                        name,
                        authorName,
                        category,
                        rating: Number(rating),
                        image,
                        updatedAt: new Date(),
                    },
                };

                const result = await booksCollection.updateOne(
                    { _id: new ObjectId(id) },
                    updatedBook
                );

                if (result.matchedCount === 0) {
                    return res.status(404).send({ success: false, message: 'Book not found' });
                }

                res.send({ success: true, message: 'Book updated successfully' });
            } catch (error) {
                console.error(error);
                res.status(500).send({ success: false, message: 'Internal Server Error' });
            }
        });
        app.get('/books/category/:category', async (req, res) => {
            try {
                const { category } = req.params;
                const books = await booksCollection.find({ category }).toArray();

                if (!books.length) {
                    return res.status(404).send({ success: false, message: 'No books found for this category' });
                }

                res.send(books);
            } catch (error) {
                console.error(error);
                res.status(500).send({ success: false, message: 'Internal Server Error' });
            }
        });
        app.post('/borrow', verifyToken, async (req, res) => {
            try {
                const { bookId, returnDate } = req.body;
                const userEmail = req.user.email;
                const alreadyBorrowed = await borrowCollection.findOne({
                    bookId: new ObjectId(bookId),
                    userEmail,
                    isReturned: false,
                });

                if (alreadyBorrowed) {
                    return res.status(400).send({ success: false, message: 'You have already borrowed this book' });
                }

                const activeBorrows = await borrowCollection.countDocuments({ userEmail, isReturned: false });

                if (activeBorrows >= 3) {
                    return res.status(400).send({ success: false, message: 'Cannot borrow more than 3 books' });
                }

                const book = await booksCollection.findOneAndUpdate(
                    { _id: new ObjectId(bookId), quantity: { $gt: 0 } },
                    { $inc: { quantity: -1 } },
                    { returnDocument: 'after' }
                );

                const borrowRecord = {
                    bookId: new ObjectId(bookId),
                    userEmail,
                    returnDate: new Date(returnDate),
                    isReturned: false,
                    createdAt: new Date(),
                };

                await borrowCollection.insertOne(borrowRecord);

                res.send({ success: true, message: 'Book borrowed successfully' });
            } catch (error) {
                console.error(error);
                res.status(500).send({ success: false, message: 'Internal Server Error' });
            }
        });
        app.post('/return', verifyToken, async (req, res) => {
            try {
                const { borrowId } = req.body;
        
                const borrowRecord = await borrowCollection.findOne({ _id: new ObjectId(borrowId), isReturned: false });
        
                if (!borrowRecord) {
                    return res.status(400).send({
                        success: false,
                        message: 'Borrow record not found or already returned',
                    });
                }
        
                const deleteResult = await borrowCollection.deleteOne({ _id: new ObjectId(borrowId) });
        
                if (deleteResult.deletedCount === 0) {
                    return res.status(500).send({
                        success: false,
                        message: 'Failed to delete borrow record',
                    });
                }
        
                const updateBookResult = await booksCollection.updateOne(
                    { _id: new ObjectId(borrowRecord.bookId) },
                    { $inc: { quantity: 1 } }
                );
        
                if (updateBookResult.modifiedCount === 0) {
                    console.error('Error updating book quantity');
                    return res.status(500).send({
                        success: false,
                        message: 'Failed to update book quantity',
                    });
                }
        
                res.send({ success: true, message: 'Book returned successfully' });
            } catch (error) {
                console.error('Error during book return:', error);
                res.status(500).send({ success: false, message: 'Internal Server Error' });
            }
        });
        
        
        app.get('/borrowed-books', verifyToken, async (req, res) => {
            try {
                const userEmail = req.user.email;
                const borrowedBooks = await borrowCollection.aggregate([
                    { $match: { userEmail, isReturned: false } },
                    {
                        $lookup: {
                            from: 'books', 
                            localField: 'bookId',
                            foreignField: '_id',
                            as: 'bookDetails'
                        }
                    },
                    { $unwind: '$bookDetails' },
                    {
                        $project: {
                            _id: 1,
                            bookId: 1,
                            title: '$bookDetails.name',
                            category: '$bookDetails.category',
                            coverImage: '$bookDetails.image',
                            createdAt: 1,
                            returnDate: 1,
                        }
                    }
                ]).toArray();
        
                res.send(borrowedBooks);
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