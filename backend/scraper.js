const fs = require('fs');
const path = require('path');
const csv = require('csv-parser');
const db= require('./db');

const DATA_FOLDER = path.join(__dirname, './../data');

function isNotEmpty(str) { return str && str.trim().length > 0; }

// function for parsing CSV file
async function parseCSVFile(filePath) {
  console.log(`Processing the file: ${filePath}`);
  
  const results = [];
  
  return new Promise((resolve, reject) => {
    fs.createReadStream(filePath)
      .pipe(csv())
      .on('data', (data) => {
        // check up, that a document has title и content
        if (isNotEmpty(data.title) && isNotEmpty(data.content))
          results.push({ title: data.title.trim(),  content: data.content.trim() });

      })
      .on('end', () => {
        console.log(`Processed ${results.length} documents from file ${path.basename(filePath)}`);
        resolve(results);
      })
      .on('error', (error) => {
        console.error(`Error while processing file ${filePath}:`, error);
        reject(error);
      });
  });
}

// function for loading data to MongoDB
async function loadToMongoDB(documents) {
  console.log(`Loading documents to MongoDB...`);
  
  let successCount = 0;
  let errorCount = 0;
  
  for (const doc of documents) {
    try {
      await db.addDocument(doc.title, doc.content);
      successCount++;
    } catch (error) {
      console.error(`Error while processing document "${doc.title}":`, error.message);
      errorCount++;
    }
  }
  
  console.log(`LOADED: success - ${successCount}, with errors - ${errorCount}`);
}

// main function for parsing logic
async function processAllCSVFiles() {
  console.log('SCRAPER START WORKING');

  try {
    // connecting to db
    await db.connect();

    // getting a list of all files from folder data
    const files = fs.readdirSync(DATA_FOLDER);
    
    // filter CSV files
    const csvFiles = files.filter(file => path.extname(file).toLowerCase() === '.csv');
    console.log(`Found ${csvFiles.length} CSV files in folder ${DATA_FOLDER}`);
    
    if (csvFiles.length === 0) {
      console.log('CSV FILES ARE NOT FOUND. END OF WORK.');
      return;
    }

    // processing files
    let allDocuments = [];
    
    for (const file of csvFiles) {
      const filePath = path.join(DATA_FOLDER, file);
      const documents = await parseCSVFile(filePath);
      allDocuments = allDocuments.concat(documents);
    }
    
    // load all documents to MongoDB
    await loadToMongoDB(allDocuments);

  } catch (error) {
    console.error('Error while loaded all documents to MongoDB:', error);
  }
}

module.exports = {
  processAllCSVFiles,
};