const db = require("../backend/db");
const jsep = require("jsep");
const { preprocessQuery, createInvertedIndex, recursiveParseQuery, rankQueryArray, createMatrix } = require("../backend/textProcessor.js");
const sizeof = require('object-sizeof');

// function for testing and comparing performance
async function comparePerformance() {
    console.log('Starting performance testing');

    // Test query
    const query = "car or (!apple and dog)";
    console.log(`Test query: "${query}"`);

    // Fetch all documents from the database
    const allDocuments = await db.getAllDocuments();
    const allId = allDocuments.map(doc => String(doc._id));
    const parsedQuery = preprocessQuery(query);
    const root = jsep(parsedQuery);

    // Array of slice sizes for testing
    const sliceSizes = [1000, 2000, 3000, 4000, 5000, 6000, 7000, 8000, 9000, 10000,
    11000, 12000, 13000, 14000, 15000, 16000, 17000];

    // Iterate over each slice size
    for (let size of sliceSizes) {
        if (size > allDocuments.length) {
            console.log(`Only ${allDocuments.length} documents available. Stopping test.`);
            break;
        }

        console.log(`\n--- Testing for ${size} documents ---`);
        const docsSlice = allDocuments.slice(0, size);

        // INVERTED INDEX TESTS

        // Measure time for creating the inverted index
        console.time(`Index creation time for ${size}`);
        const index = await createInvertedIndex(docsSlice);
        console.timeEnd(`Index creation time for ${size}`);

        // Calculate the size of the index in memory
        const statsRam = sizeof(index);
        const sizeMBRam = (statsRam / (1024 * 1024)).toFixed(2);
        console.log(`Index size in RAM for ${size} documents: ${statsRam} bytes [${sizeMBRam} MB]`);

        // Measure time for index search
        console.time(`Index search time for ${size}`);
        const indexResult = recursiveParseQuery(root, index, docsSlice.map(doc => String(doc._id)));
        console.timeEnd(`Index search time for ${size}`);

        // Measure time for ranking the search results
        console.time(`Ranking time for ${size}`);
        const indexRanked = await rankQueryArray(root, index, indexResult, docsSlice);
        console.timeEnd(`Ranking time for ${size}`);

        // // Display top 5 inverted index results for the current slice
        // console.log(`\nTop 5 inverted index results for ${size} documents:`);
        // indexRanked.slice(0, 5).forEach(result => {
        //     console.log(`ID: ${result.obj._id}, Rank: ${result.rank}`);
        // });

        // MATRIX TESTS

        // Measure time for creating the matrix
        // console.time(`Matrix creation time for ${size}`);
        // const matrix = await createMatrix(docsSlice);
        // console.timeEnd(`Matrix creation time for ${size}`);
        //
        // // Calculate the size of the matrix in memory
        // const matrixStatsRam = sizeof(matrix);
        // const matrixSizeMBRam = (matrixStatsRam / (1024 * 1024)).toFixed(2);
        // console.log(`Matrix size in RAM for ${size} documents: ${matrixStatsRam} bytes [${matrixSizeMBRam} MB]`);
        //
        // // Measure time for matrix search
        // console.time(`Matrix search time for ${size}`);
        // const matrixResults = recursiveParseQuery(root, matrix, docsSlice.map(doc => String(doc._id)));
        // console.timeEnd(`Matrix search time for ${size}`);
        //
        // // Measure time for ranking the matrix search results
        // console.time(`Matrix ranking time for ${size}`);
        // const matrixRanked = await rankQueryArray(root, matrix, matrixResults, docsSlice);
        // console.timeEnd(`Matrix ranking time for ${size}`);

        // // Display top 5 matrix results for the current slice
        // console.log(`\nTop 5 matrix results for ${size} documents:`);
        // matrixRanked.slice(0, 5).forEach(result => {
        //     console.log(`ID: ${result.obj._id}, Rank: ${result.rank}`);
        // });

        // // Test saving the matrix to MongoDB
        // console.time(`Matrix save time for ${size}`);
        // await db.storeIndexToMongo(matrix);
        // console.timeEnd(`Matrix save time for ${size}`);
        //
        // // Test loading the matrix from MongoDB
        // console.time(`Matrix load time for ${size}`);
        // const matrixCopy = await db.loadIndexFromMongo();
        // console.timeEnd(`Matrix load time for ${size}`);
        //
        // // Measure time for searching on the loaded matrix
        // console.time(`MatrixCopy search time for ${size}`);
        // const matrixResultsCopy = recursiveParseQuery(root, matrixCopy, docsSlice.map(doc => String(doc._id)));
        // console.timeEnd(`MatrixCopy search time for ${size}`);
        //
        // // Measure time for ranking the search results from the loaded matrix
        // console.time(`MatrixCopy ranking time for ${size}`);
        // const matrixRankedCopy = await rankQueryArray(root, matrix, matrixResultsCopy, docsSlice);
        // console.timeEnd(`MatrixCopy ranking time for ${size}`);

        // // Display top 5 results for the loaded matrix
        // console.log(`\nTop 5 matrix copy results for ${size} documents:`);
        // matrixRankedCopy.slice(0, 5).forEach(result => {
        //     console.log(`ID: ${result.obj._id}, Rank: ${result.rank}`);
        // });
    }
}


// Wrap code to function, to avoid await on top level ( because of CommonJS module system )
function runTest() {
    db.connect()
        .then(async () => {
            try {
                await comparePerformance();
            } catch (error) {
                console.error('Error during test:', error);
            } finally {
                await db.close();
                console.log('Database connection closed');
            }
        })
        .catch(async error => {
            console.error('Failed to connect to database:', error);
            await db.close();
        });
}

runTest();