const {removeStopwords} = require('stopword');
const {PorterStemmer} = require('natural');
const jsep = require('jsep');
const {difference, union, intersection} = require("lodash");

function preprocessQuery(query) {
    return query.toLowerCase().replace(/\band\b/g, "&&").replace(/\bor\b/g, "||").replace(/\bnot\b/g, "!");
}

function countTerms(node) {
    if (!node) return 0;

    // if node type is Identifier, increase counter by 1
    let count = (node.type === 'Identifier') ? 1 : 0;

    // recursively process child nodes depending on the node type
    switch (node.type) {
        case 'BinaryExpression':
        case 'LogicalExpression':
            count += countTerms(node.left);
            count += countTerms(node.right);
            break;
        case 'UnaryExpression':
            count += countTerms(node.argument);
            break;
        case 'ConditionalExpression':
            count += countTerms(node.test);
            count += countTerms(node.consequent);
            count += countTerms(node.alternate);
            break;
        case 'CallExpression':
            count += countTerms(node.callee);
            node.arguments.forEach(arg => {
                count += countTerms(arg);
            });
            break;
        case 'MemberExpression':
            count += countTerms(node.object);
            count += countTerms(node.property);
            break;
        case 'ArrayExpression':
            node.elements.forEach(elem => {
                if (elem) count += countTerms(elem);
            });
            break;
        // for other node types (for example, Literal) there are no additional child nodes
        default:
            break;
    }

    return count;
}

/**
 * Creates an inverted index based on a collection of documents.
 * 
 * @param {Array} allDocuments - Array of all documents from the database.
 * @returns {Promise<Map>} - Map where:
 *    - key: stemmed term (word after processing)
 *    - value: object { count, documents }, where:
 *      - count: total occurrences of the term across all documents
 *      - documents: array of objects { id, tfidf }, containing:
 *        - id: document identifier
 *        - tfidf: normalized TF-IDF value for the term in the document
 * 
 * Algorithm:
 * 1. Splits text of each document into words
 * 2. Removes stopwords (common words with little semantic value)
 * 3. Applies stemming (reducing words to their base form)
 * 4. Counts frequency of each term in each document
 * 5. Calculates TF-IDF to normalize term weights
 * 6. Normalizes all TF-IDF values to range [0,1]
 */
async function createInvertedIndex(allDocuments) {

    const index = new Map();
    const totalDocuments = allDocuments.length;

    // Count term frequencies and store document-term frequencies
    allDocuments.forEach((doc) => {
        const words = doc.content.toLowerCase().replace(/[.,\/#!$%^&*;:{}=\-_`~()]/g, "").split(/\s+/);
        const filteredWords = removeStopwords(words);
        const stemmedTerms = filteredWords.map((word) => PorterStemmer.stem(word));

        const docTermFrequency = new Map();
        stemmedTerms.forEach((term) => {
            docTermFrequency.set(term, (docTermFrequency.get(term) || 0) + 1);
        });

        docTermFrequency.forEach((count, term) => {
            if (!index.has(term)) {
                index.set(term, {count: 0, documents: [], maxFreq: 0});
            }

            // Track total count and update max frequency if needed
            index.get(term).count += count;
            index.get(term).maxFreq = Math.max(index.get(term).maxFreq, count);

            // Store document ID with raw count for now
            index.get(term).documents.push({
                id: doc._id,
                count: count
            });
        });
    });

    // Calculate TF-IDF using the max frequency of each term
    index.forEach((value, term) => {
        const docFrequency = value.documents.length;
        const idf = Math.log2(totalDocuments / docFrequency);

        // Normalize by max frequency of this specific term
        value.documents.forEach(doc => {
            const tf = doc.count / value.maxFreq;
            doc.tfidf = tf * idf;
            delete doc.count; // Remove temporary count property
        });

        // Remove temporary maxFreq property
        delete value.maxFreq;
    });

    // Normalization of all TF-IDF values to the interval [0,1]
    let maxTfIdf = 0;

    // Find the maximum TF-IDF value in the entire index
    index.forEach((value) => {
        value.documents.forEach(doc => {
            maxTfIdf = Math.max(maxTfIdf, doc.tfidf);
        });
    });

    // Normalize all values by dividing by the maximum value
    if (maxTfIdf > 0) {
        index.forEach((value) => {
            value.documents.forEach(doc => {
                doc.tfidf = doc.tfidf / maxTfIdf;
            });
        });
    }

    //console.log(`TF-IDF values normalized to range [0, 1] with max value: ${maxTfIdf}`);

    return index;
}

/**
 * Recursively analyzes the query tree and returns an array of document IDs that match the conditions.
 * 
 * @param {Object} root - Root node of the query syntax tree (result of jsep parsing).
 * @param {Map} index - Inverted index created by the createInvertedIndex function
 * @param {Array<string>} allId - Array of all document identifiers in the system.
 * @returns {Array<string>} - Array of document identifiers that satisfy the query
 * 
 * Algorithm:
 * 1. For a simple term (Identifier), returns array of all document IDs containing this term
 * 2. For NOT expression (UnaryExpression), returns documents not containing the specified term
 * 3. For AND (BinaryExpression with && operator), returns intersection of results
 * 4. For OR (BinaryExpression with || operator), returns union of results
 */
function recursiveParseQuery(root, index, allId) {

    if (root.type === "Compound")
        throw SyntaxError("Missing operator while parsing query tree")

    if (root.type === 'Identifier') {
        root.name = PorterStemmer.stem(root.name)
        return index.has(root.name) ? index.get(root.name).documents.map(x => String(x.id)) : [];

    } else if (root.type === 'UnaryExpression') {
        return difference(allId, recursiveParseQuery(root.argument, index, allId));

    } else if (root.type === 'BinaryExpression') {

        let left = recursiveParseQuery(root.left, index, allId);
        let right = recursiveParseQuery(root.right, index, allId);

        if (root.operator === '&&')
            return intersection(left, right);

        else if (root.operator === '||')
            return union(left, right);

        else
            throw SyntaxError("Invalid operator while parsing query tree")

    }

    return [];
}

/**
 * Recursively calculates the rank (relevance) of a document for a given search expression.
 * Based on extended Boolean search model with fuzzy logic.
 * 
 * @param {Object} root - Root node of the query syntax tree (result of jsep parsing).
 * @param {Map} index - Inverted index created by the createInvertedIndex function
 * @param {string} targetId - Document identifier for which the rank is calculated
 * @param {number} termCnt - Number of unique terms in the query.
 * @returns {number} - Document relevance value in range [0,1],
 *
 * Algorithm:
 * 1. For a simple term (Identifier), returns its TF-IDF weight in the document
 * 2. For NOT (UnaryExpression), returns 1 minus term weight
 * 3. For AND (&&), uses normalized p-norm for fuzzy intersection
 * 4. For OR (||), uses normalized p-norm for fuzzy union
 */
function recursiveRank(root, index, targetId, termCnt) {
    if (root.type === 'Identifier') {
        root.name = PorterStemmer.stem(root.name);
        if (index.has(root.name)) {
            const docEntry = index.get(root.name).documents.find((obj) => String(obj.id) === targetId);
            return docEntry ? docEntry.tfidf : 0;
        } else return 0;

    } else if (root.type === 'UnaryExpression') {
        return 1 - recursiveRank(root.argument, index, targetId, termCnt);

    } else if (root.type === 'BinaryExpression') {

        let left = recursiveRank(root.left, index, targetId, termCnt);
        let right = recursiveRank(root.right, index, targetId, termCnt);

        if (root.operator === '&&')
            return 1 - Math.sqrt((Math.pow(1 - left, 2) + Math.pow(1 - right, 2)) / termCnt);

        else if (root.operator === '||')
            return Math.sqrt((Math.pow(left, 2) + Math.pow(right, 2)) / termCnt);

        else
            throw SyntaxError("Invalid operator while parsing query tree")

    }

    return 0;
}

/**
 * Ranks an array of documents according to the search query.
 * 
 * @param {Object} root - Root node of the query syntax tree (result of jsep parsing)
 * @param {Map} index - Inverted index created by the createInvertedIndex function
 * @param {Array<string>} idArray - Array of document identifiers to rank.
 * @param {Array} allDocuments - Array of all documents from the database.
 * @returns {Promise<Array>} - Array of objects { obj, rank }, where:
 *    - obj: complete document information
 *    - rank: document relevance value in range [0,1]
 *    Array is sorted by decreasing relevance (most relevant documents first).
 * 
 * Algorithm:
 * 1. Filters the array of all documents, keeping only those whose IDs are in idArray
 * 2. Calculates the number of terms in the query for normalization
 * 3. Calculates rank for each document using recursiveRank
 * 4. Sorts results by decreasing rank
 */
async function rankQueryArray(root, index, idArray, allDocuments) {
    const filteredObjects = allDocuments.filter(x => idArray.includes(String(x._id)));
    const answer = [];
    
    // count terms in query tree for normalization
    const termCnt = countTerms(root);
    
    // calculate rank for each document, passing termCnt
    filteredObjects.forEach(x => {
        answer.push({
            obj: x, 
            rank: recursiveRank(root, index, String(x._id), termCnt)
        });
    });
    
    answer.sort((a, b) => b.rank - a.rank);
    return answer;
}

/**
 * Creates a matrix based on the inverted index, where each term contains all documents.
 * Documents where the term does not appear have tfidf = 0.
 * @param {Array} allDocuments - Array of all documents from the database.
 * @returns {Promise<Map>} - Matrix of terms and documents
 */
async function createMatrix(allDocuments) {
    const matrix = new Map();
    const totalDocuments = allDocuments.length;

    allDocuments.forEach((doc) => {
        const words = doc.content.toLowerCase().replace(/[.,\/#!$%^&*;:{}=\-_`~()]/g, "").split(/\s+/);
        const filteredWords = removeStopwords(words);
        const stemmedTerms = filteredWords.map((word) => PorterStemmer.stem(word));

        const docTermFrequency = new Map();
        stemmedTerms.forEach((term) => {
            docTermFrequency.set(term, (docTermFrequency.get(term) || 0) + 1);
        });

        docTermFrequency.forEach((count, term) => {
            if (!matrix.has(term)) {
                matrix.set(term, {count: 0, documents: allDocuments.map(doc => ({id: doc._id, count: 0})), maxFreq: 0, docFrequency: 0});
            }

            matrix.get(term).count += count;
            matrix.get(term).maxFreq = Math.max(matrix.get(term).maxFreq, count);
            matrix.get(term).docFrequency += 1;
            matrix.get(term).documents = matrix.get(term).documents.map((vectorDoc) => {
                if(String(vectorDoc.id) === String(doc._id))
                    return {id: vectorDoc.id, count: count};
                else
                    return vectorDoc;
            });
        });
    });

    matrix.forEach((value, term) => {
        const docFrequency = value.docFrequency;
        const idf = Math.log2(totalDocuments / docFrequency);

        value.documents.forEach(doc => {
            const tf = doc.count / value.maxFreq;
            doc.tfidf = tf * idf;
            delete doc.count;
        });

        delete value.maxFreq;
    });

    // Normalization of all TF-IDF values to the interval [0,1]
    let maxTfIdf = 0;

    // Find the maximum TF-IDF value in the entire index
    matrix.forEach((value) => {
        value.documents.forEach(doc => {
            maxTfIdf = Math.max(maxTfIdf, doc.tfidf);
        });
    });

    // Normalize all values by dividing by the maximum value
    if (maxTfIdf > 0) {
        matrix.forEach((value) => {
            value.documents.forEach(doc => {
                doc.tfidf = doc.tfidf / maxTfIdf;
            });
        });
    }

    //console.log(`TF-IDF values normalized to range [0, 1] with max value: ${maxTfIdf}`);

    return matrix;

}

module.exports = {
    preprocessQuery,
    createInvertedIndex,
    recursiveParseQuery,
    recursiveRank,
    rankQueryArray,
    createMatrix,
};