'use strict';
const nconf = require('nconf');
const MongoClient = require('mongodb').MongoClient;
const inquirer = require('inquirer');
const {table} = require('table');

nconf.argv().env().file('./config.json');

// initialize variables to store product data retrieved from the database and updated product quantity
let productData, updatedQuantity;

// Mongodb connection setup
const uri = `mongodb+srv://${nconf.get('mongodb:username')}:${nconf.get('mongodb:password')}@${nconf.get("mongodb:hostlist")}/${nconf.get('mongodb:database')}?retryWrites=true`;
const client = new MongoClient(uri, { useNewUrlParser: true });

// Wrapping the initial database query in a promise to ensure that the update query is executed afterward
const shopFront = new Promise((resolve, reject) => {

    // Connect to database and read all documents in the products collection
    client.connect(async (err) => {
        if (err) reject(err);
        const collection = client.db(nconf.get("mongodb:database")).collection("products");

        // Gather data from the products collection
        productData = await collection.find({}).toArray();

        // Create a table of the most relevant data for the customer to see
        let dataTable = [['Product Name', 'Price ($)']];
        for (let item of productData) {
        dataTable.push([item.product_name, item.price]);
        }
        console.log(table(dataTable));

        // Prompt the user to choose an item to purchase and select a quantity once the data has been gathered
        client.close(() => {
            inquirer
            // First prompt for the item ID of the desired item
            .prompt([{
                type: 'input',
                name: 'name',
                message: 'Enter the name of the product you would like to purchase:',
                validate: (input) => {
                    const validNames = productData.map(doc => doc.product_name);
                    if (validNames.indexOf(input) != -1) {
                        return true;
                    }
                    return 'Please enter a valid product name';
                }
            },
            // Next prompt for the quantity to purchase
            {
                type: 'number',
                name: 'quantity',
                message: 'How many would you like to purchase?',
                validate: (input) => {
                    if (input >= 0) {
                        return true;
                    }
                    return 'Plese enter a valid quantity';
                },
                default: 0
            }])
            // After answers are collected, if there isn't enough in stock cancel the purchase. Otherwise, display price and update purhcase completion status
            .then((answers) => {
                let selectionIndex;
                for (let i = 0; i < productData.length; i++) {
                    if (productData[i].product_name == answers.name) {
                        selectionIndex = i;
                        break;
                    }
                }
                updatedQuantity = productData[selectionIndex].stock_quantity - answers.quantity;
                if (updatedQuantity < 0) {
                    console.log('Insufficient quantity in stock, Sorry!')
                } else {
                    console.log(`Price of purchase: $${productData[selectionIndex].price * answers.quantity}`);
                }
                resolve(answers);
            }).catch((error) => {
                reject(error);
            });

        });

    });

});

// If the purchase was successfully completed, update the database to reflect the new quantity of the purchased item.
shopFront.then((answers) => {

    const client2 = new MongoClient(uri, { useNewUrlParser: true });
    client2.connect(err => {
        if (err) throw err;
        const collection = client2.db(nconf.get("mongodb:database")).collection("products");
        collection.updateOne({product_name: `${answers.name}`}, {$set: {stock_quantity: updatedQuantity}}, () => {
            console.log('Database updated.');
        });
        client2.close();
    });
});

shopFront.catch((error) => {
    throw error;
});