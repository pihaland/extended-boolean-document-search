const express = require('express');
const dotenv = require('dotenv');
const db = require('./db');
const scraper = require('./scraper');
const textProcessor = require('./textProcessor')
const jsep = require("jsep");

// Load environment variables
dotenv.config();

const app = express();
const port = process.env.PORT || 3000;
const adminPassword = process.env.ADMIN_PASSWORD;
let lastIndex = null;

// Middleware
app.use(express.json()); // allow Express to parse json request from string to req.body object
app.use(express.static('frontend')); // turn on serving static files (here for frontend as entry point)

// Initialize database connection
db.connect().catch(err => {
    console.error('Database connection error:', err);
    process.exit(1);
});

// Search endpoint
app.post('/api/search', async (req, res) => {
    try {
        const query = req.body.query;

        if (!query) return res.status(400).json({error: 'Search query is required'}); // empty query

        console.log();

        await db.connect();
        const isEmpty = await db.isIndexEmpty();

        if (isEmpty && lastIndex === null) console.log('Inverted index is empty: CREATING');
        else if (lastIndex === null) console.log('Inverted index has been found in DB: LOADING');
        else console.log('Inverted index has been found in RAM: IN MEMORY');

        const allDocuments = await db.getAllDocuments();
        const allId = allDocuments.map(x => String(x._id));
        const processedQuery = textProcessor.preprocessQuery(query);
        const root = jsep(processedQuery);

        if (isEmpty) {
            console.time('Index creation and loaded to MongoDB');
            const index = await textProcessor.createInvertedIndex(allDocuments);
            await db.storeIndexToMongo(index);
            console.time('Index creation and loaded to MongoDB');

            lastIndex = index; // Store the last index for future reference
        } else if (lastIndex === null)
            lastIndex = await db.loadIndexFromMongo();

        console.time('Index search');
        //const fulfillDocs = allId; // return all docs
        const fulfillDocs = textProcessor.recursiveParseQuery(root, lastIndex, allId); // return all docs that fulfill query
        console.timeEnd('Index search');

        console.time('Index ranking');
        const indexRanked = await textProcessor.rankQueryArray(root, lastIndex, fulfillDocs, allDocuments);
        console.timeEnd('Index ranking');
        console.log();

        // Transform results into the format expected by the frontend
        const results = indexRanked.map(item => ({...item.obj, rank: parseFloat(item.rank.toFixed(4))})); // Include rank and format to 4 decimal places

        //if (results.length > 10) results.length = 10; // Limit to 10 results

        res.json({results});

    } catch (error) {
        await db.close();
        console.error('Search error:', error);
        res.status(400).json({error: error.message || 'Unknown error occurred'});
    }
});

// Admin authentication
app.post('/api/admin/login', (req, res) => {
    const {password} = req.body;

    if (password === adminPassword) {
        res.sendStatus(200);
    } else {
        res.status(401).json({error: 'Invalid password'});
    }
});

// Get all documents
app.get('/api/admin/documents', async (req, res) => {
    try {
        const documents = await db.getAllDocuments();

        if (!documents || !Array.isArray(documents)) {
            console.error('Invalid documents response:', documents);
            return res.status(500).json({
                error: 'Failed to fetch documents',
                documents: []
            });
        }

        console.log(`Sending ${documents.length} documents to client`);
        res.json(documents);

    } catch (error) {
        console.error('Error fetching documents:', error);
        res.status(500).json({
            error: 'Failed to fetch documents',
            documents: []
        });
    }

});

// Add new document
app.post('/api/admin/documents', async (req, res) => {
    try {
        const {title, content} = req.body;

        if (!title || !content) {
            return res.status(400).json({error: 'Title and content are required'});
        }

        // Add document to database
        const result = await db.addDocument(title, content);

        res.status(201).json({
            _id: result.insertedId,
            title,
            content
        });
    } catch (error) {
        console.error('Error adding document:', error);
        res.status(500).json({error: 'Failed to add document'});
    }
});

// Delete document
app.delete('/api/admin/documents/:id', async (req, res) => {
    try {
        const {id} = req.params;

        // Get document before deletion to remove from index
        const document = await db.getDocumentById(id);

        if (!document) {
            return res.status(404).json({error: 'Document not found'});
        }

        // Delete from documents collection
        const result = await db.deleteDocument(id);

        if (!result) {
            return res.status(500).json({error: 'Failed to delete document'});
        }

        res.sendStatus(204);
    } catch (error) {
        console.error('Error deleting document:', error);
        res.status(500).json({error: 'Failed to delete document'});
    }
});

// Refresh data (drop collection, run scraper and preprocess data)
app.post('/api/admin/refresh-data', async (req, res) => {
    try {
        console.log('Starting data refresh operation');

        // Drop the collection
        const dropResult = await db.dropCollection();
        if (!dropResult) {
            return res.status(500).json({error: 'Failed to drop collection'});
        }

        await scraper.processAllCSVFiles();

        // Recreate the inverted index
        console.log('Creating inverted index');
        const allDocuments = await db.getAllDocuments();
        const index = await textProcessor.createInvertedIndex(allDocuments);
        await db.storeIndexToMongo(index);
        console.log('Inverted index created and stored in MongoDB');

        lastIndex = index; // Store the last index for future reference

        res.status(200).json({success: true, message: 'Collection successfully refreshed'});
    } catch (error) {
        console.error('SCRAPER END WORKING : CRITICAL ERROR:', error);
        res.status(500).json({error: 'Failed to refresh data'});
    }
});

// Update data (preprocess data from database again)
app.post('/api/admin/update-data', async (req, res) => {
    try {
        console.log('Starting data update operation');

        // Recreate the inverted index
        console.log('Creating inverted index');
        const allDocuments = await db.getAllDocuments();
        const index = await textProcessor.createInvertedIndex(allDocuments);
        await db.storeIndexToMongo(index);
        console.log('Inverted index created and stored in MongoDB');

        lastIndex = index; // Store the last index for future reference

        res.status(200).json({success: true, message: 'Collection successfully updated'});
    } catch (error) {
        console.error('Failed to update data:', error);
        res.status(500).json({error: 'Failed to update data'});
    }
});

// Drop the collection
app.post('/api/admin/drop-data', async (req, res) => {
    try {
        const dropResult = await db.dropCollection();
        lastIndex = null; // Reset lastIndex after dropping collection
        if (!dropResult) {
            return res.status(500).json({error: 'Failed to drop collection'});
        }
        res.status(200).json({success: true, message: 'Collection successfully dropped'});
    } catch (error) {
        console.error('Failed to drop collection:', error);
        res.status(500).json({error: 'Failed to drop collection'});
    }
})

// Start server
const server = app.listen(port, () => {
    console.log(`Server is running on port ${port}`);
});

// Handle graceful shutdown
process.on('SIGINT', async () => {
    console.log('Received SIGINT. Closing server and database connection...');
    await db.close();
    server.close(() => {
        console.log('Server closed');
        process.exit(0);
    });
});

process.on('SIGTERM', async () => {
    console.log('Received SIGTERM. Closing server and database connection...');
    await db.close();
    server.close(() => {
        console.log('Server closed');
        process.exit(0);
    });
});