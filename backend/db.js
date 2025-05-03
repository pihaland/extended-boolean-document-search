const {MongoClient, ObjectId} = require('mongodb');
const dotenv = require('dotenv');

// Load environment variables
dotenv.config();

// MongoDB connection URL
const MONGO_URI = process.env.MONGO_URI || 'mongodb://localhost:27017/extended_boolean_search';

// Database name
const DB_NAME = process.env.MONGO_DB_NAME || 'extended_boolean_search';

let client;
let db;
let documentsCollection;

/** Connect to MongoDB database */
async function connect() {
    if (db) return db;

    try {
        client = await MongoClient.connect(MONGO_URI);
        console.log('Connected to MongoDB');

        db = client.db(DB_NAME);
        documentsCollection = db.collection('documents');

        return db;
    } catch (error) {
        console.error('MongoDB connection error:', error);
        throw error;
    }
}

function getDb() {
    if (!db) {
        throw new Error('Database connection not established');
    }
    return db;
}

/**
 * Checks if the inverted index in MongoDB is empty.
 * @param {string} collectionName - Name of the collection where the index is stored (by default 'invertedIndex').
 * @returns {Promise<boolean>} - Returns true if the collection is empty, otherwise false.
 */
async function isIndexEmpty(collectionName = 'invertedIndex') {
    if (!db) {
        throw new Error('Database connection not established');
    }
    const indexCollection = db.collection(collectionName);
    const count = await indexCollection.countDocuments();
    return count === 0;
}

/**
 * Store Inverted Index (Map) in MongoDB, storing each term as a separate document.
 * @param {Map} index - Inverted Index
 * @param {string} collectionName - Name of the collection where data will be stored (by default 'invertedIndex')
 * @returns {Promise<void>}
 */
async function storeIndexToMongo(index, collectionName = 'invertedIndex') {
    if (!db) {
        throw new Error('Database connection not established');
    }
    const indexCollection = db.collection(collectionName);

    await indexCollection.deleteMany({}); // Drop old collection if exists

    // Convert Map to array of documents
    // Each element will be { _id: term, count, documents }
    // count -> index.get(term).count
    // documents -> index.get(term).documents ( [{id, tfidf}, ...] )
    // If you have any other fields, add them.
    const bulkData = [];
    index.forEach((value, term) => {
        bulkData.push({
            _id: term,
            count: value.count,
            documents: value.documents
        });
    });

    await indexCollection.insertMany(bulkData); // Insert all documents in one bulk operation

    console.log(`Inverted Index stored in MongoDB as separate docs. Terms stored: ${bulkData.length}`);
}

/**
 * load InvertedIndex (Map) from MongoDB.
 * @returns {Promise<Map>}
 */
async function loadIndexFromMongo() {
    if (!db) {
        throw new Error('Database connection not established');
    }
    const indexCollection = db.collection('invertedIndex');

    const docs = await indexCollection.find({}).toArray();     // Get all documents - each document = one term

    // Convert back to Map
    // docs will be an array of:
    // [ { _id: "car", count: 17, documents: [ {id, tfidf} ... ] },
    //   { _id: "apple", count: 22, documents: [...] },
    //   ... ]
    const restoredMap = new Map();
    for (const doc of docs) {
        restoredMap.set(doc._id, {
            count: doc.count,
            documents: doc.documents
        });
    }

    console.log(`Inverted Index loaded from MongoDB. Terms found: ${restoredMap.size}`);
    return restoredMap;
}

/**
 * Add new document to database
 * @param {string} title - Document title
 * @param {string} content - Document content
 * @returns {Promise<Object>} - Result of add operation
 */
async function addDocument(title, content) {
    if (!documentsCollection) {
        throw new Error('Database connection not established');
    }

    if (!title || typeof title !== 'string') {
        throw new Error('Invalid title: Title must be a non-empty string');
    }

    if (!content || typeof content !== 'string') {
        throw new Error('Invalid content: Content must be a non-empty string');
    }

    const obj = {
        title: title.trim(),
        content: content.trim()
    };

    return await documentsCollection.insertOne(obj);
}

/**
 * Get all documents from database
 * @returns {Promise<Array>} - Array of documents
 */
async function getAllDocuments() {
    if (!documentsCollection) {
        throw new Error('Database connection not established');
    }

    try {
        const docs = await documentsCollection
            .find({})
            .sort({_id: 1})
            .project({_id: 1, title: 1, content: 1})
            .toArray();

        console.log(`Retrieved ${docs.length} documents from database`);
        return docs || [];
    } catch (error) {
        console.error('Error fetching documents:', error);
        return [];
    }
}

/**
 * Get document by ID
 * @param {string} id - Document ID
 * @returns {Promise<Object>} - Document
 */
async function getDocumentById(id) {
    if (!documentsCollection) {
        throw new Error('Database connection not established');
    }

    return await documentsCollection.findOne({_id: new ObjectId(id)});
}

/**
 * Delete document by ID
 * @param {string} id - Document ID
 * @returns {Promise<boolean>} - True if document was deleted
 */
async function deleteDocument(id) {
    if (!documentsCollection) {
        throw new Error('Database connection not established');
    }

    try {
        const result = await documentsCollection.deleteOne({_id: new ObjectId(id)});
        return result.deletedCount > 0;
    } catch (error) {
        console.error('Error deleting document:', error);
        return false;
    }
}

/**
 * Drop the entire documents collection
 * @returns {Promise<boolean>} - True if collection was dropped successfully
 */
async function dropCollection() {
    if (!documentsCollection) {
        throw new Error('Database connection not established');
    }

    try {
        await documentsCollection.drop();
        console.log('Documents collection dropped successfully');

        // Re-initialize the collection
        documentsCollection = db.collection('documents');
        return true;
    } catch (error) {
        console.error('Error dropping collection:', error);
        if (error.code === 26) {
            // Collection doesn't exist, which is also success for our purpose
            console.log('Collection does not exist, creating a new one');
            documentsCollection = db.collection('documents');
            return true;
        }
        return false;
    }
}

/** Close database connection [ HASN'T USED IN THIS VERSION ]*/
async function close() {
    if (client) {
        await client.close();
        console.log('MongoDB connection closed');
        client = null;
        db = null;
        documentsCollection = null;
    }
}

module.exports = {
    connect,
    getDb,
    isIndexEmpty,
    storeIndexToMongo,
    loadIndexFromMongo,
    addDocument,
    getAllDocuments,
    getDocumentById,
    deleteDocument,
    dropCollection,
    close
}; 