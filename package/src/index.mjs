
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import readline from 'readline';
import base64 from 'base64-js';
import dotenv from 'dotenv';
import openai from 'openai';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const envFilePath = './.env';
if (!fs.existsSync(envFilePath)) {
    const defaultEnvContent = `OPENAI_API_KEY="your_api_key_here"\nDISABLE_WARNING="false" # Enable at your own risk. Some OpenAI models are [very] expensive to use.`;
    fs.writeFileSync(envFilePath, defaultEnvContent);
    console.log('.env file created. Please fill in the API key.');
}
dotenv.config();

const gconfig = {
    apiKey: process.env.OPENAI_API_KEY
};

const persistentFilePath = path.join(__dirname, 'persistentData.json');

const conversationsDir = './conversations';
if (!fs.existsSync(conversationsDir)) {
    fs.mkdirSync(conversationsDir);
}

const generatedAudioDir = './gen-audio';
if (!fs.existsSync(generatedAudioDir)) {
    fs.mkdirSync(generatedAudioDir);
}

const generatedImgsDir = './gen-imgs';
if (!fs.existsSync(generatedImgsDir)) {
    fs.mkdirSync(generatedImgsDir);
}

let persistentData = {};
if (fs.existsSync(persistentFilePath)) {
    const data = fs.readFileSync(persistentFilePath, 'utf8');
    persistentData = JSON.parse(data);
} else {
    persistentData = { chatCreations: 0 };
}

function savePersistentData() {
    fs.writeFileSync(persistentFilePath, JSON.stringify(persistentData, null, 2));
}

process.on('exit', savePersistentData);
process.on('SIGINT', () => {
    savePersistentData();
    process.exit();
});
const client = new openai.OpenAI(gconfig);

async function warn() {
    if(process.env.DISABLE_WARNING === 'true') {
        return true;
    }else{
        const rl = readline.createInterface({
            input: process.stdin,
            output: process.stdout
        });

        async function askProceed(query) {
            return new Promise(resolve => rl.question(query, resolve));
        }

        async function getAns() {
            let proceed;
            let userMessage = "WARNING: Are you want to use this model? This model may be expensive. Make sure to check the OpenAI model usage rates. (more-info/y/n) ";
            while (true) {
                const checkIfOK = await askProceed(userMessage);
                if (checkIfOK.toLowerCase() === 'y') {
                    proceed = true; 
                    break;
                }else if(checkIfOK.toLowerCase() === 'n') {
                    proceed = false;
                    break;
                }else if(checkIfOK.toLowerCase() === 'more-info') {
                    console.log('WARNING: This warning was given to inform you that the model you are using may be expensive. Make sure to check the OpenAI model usage rates before continuing. To disable these messages, set DISABLE_WARNING to true in the .env file.');
                    userMessage = 'Do you want to proceed? (y/n) ';
                }else{
                    console.log('WARING: Invalid input. Please enter y or n or more-info.');
                    userMessage = 'Do you want to proceed? (y/n) ';
                }
            }
            rl.close();

            return proceed;
        }
        
        return await getAns();
    }
}

async function getResponse(config) {
    const defaultConfig = {
        type: 'chat',
        model: 'gpt-4o-mini',
        prompt: '',
        messages: [],
        sysInstructions: '',
        maxTokens: 750,
        test: false
    };

    config = { ...defaultConfig, ...config };

    const newPromise = new Promise(async (resolve, reject) => {
        try {
            let response;
            if (config.type === 'chat') {
                function changeMsgs(msgs) {
                    let newMsgs = msgs.toSpliced(0, 0, { role: 'system', content: config.sysInstructions });
                    newMsgs.push({ role: 'user', content: config.prompt });
                    console.log(newMsgs);
                    return newMsgs;
                }
                let messages = config.messages;
                messages.push({ role: 'user', content: config.prompt });

                response = await client.chat.completions.create({
                    model: config.model,
                    messages: config.sysInstructions === "" ? messages : changeMsgs(config.messages),
                    max_tokens: config.maxTokens,
                });
            } else if (config.type === 'completion') {
                response = await client.completions.create({
                    model: config.model,
                    prompt: config.prompt,
                    max_tokens: config.maxTokens,
                });
            } else if (config.type === 'embedding') {
                response = await client.embeddings.create({
                    model: config.model,
                    input: config.prompt,
                });
            }
            
            resolve(response);
        } catch (e) {
            reject(e);
        }
    });

    if (config.test) {
        return newPromise;
    } else {
        const response_1 = await newPromise;
        if (config.type === 'embedding') {
            return response_1.data;
        }
        return response_1.choices[0].message.content;
    }
}

async function cmdChat(obj, saveToFile = false, name = '') {
    const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout
    });

    persistentData.chatCreations++;

    async function askQuestion(query) {
        return new Promise(resolve => rl.question(query, resolve));
    }

    async function chatLoop() {
        let messages = [];
        while (true) {
            const userMessage = await askQuestion('You: ');
            if (userMessage.toLowerCase() === 'e-') break;
            messages.push({ role: 'user', content: userMessage });

            const response = await getResponse({ ...obj, messages });
            console.log('\nAI:', response, '\n');
            messages.push({ role: 'assistant', content: response });
        }
        rl.close();

        if (saveToFile) {
            writeFile(`./conversations/${name}.txt`, JSON.stringify(messages, null, 2), (err) => {
                if (err) throw err;
                console.log('Conversation saved.');
            });
        }

        return messages;
    }
    
    return await chatLoop();
}

function getChat(chatName) {
    const chatPath = path.join('./conversations', `${chatName}.txt`);
    if (!fs.existsSync(chatPath)) {
        console.log('Chat not found.');
        return;
    }else{
        const chatData = fs.readFileSync(chatPath, 'utf8');
        return JSON.parse(chatData);
    }
}

function deleteChat(chatName) {
    const chatPath = path.join('./conversations', `${chatName}.txt`);
    if (fs.existsSync(chatPath)) {
        fs.unlinkSync(chatPath);
        console.log('Chat deleted.');
    } else {
        console.log('Chat not found.');
    }
}

function listChats() {
    const files = fs.readdirSync('./conversations');
    const chatFiles = files.filter(file => file.endsWith('.txt'));
    return chatFiles.map(file => file.replace('.txt', ''));
}

async function generateAudio(tts_text, speechFilePath, systemContent) {
    let proceed = await warn();
    let completion;
    if(!proceed) {
        return "Audio generation cancelled.";
    }
    for(let i = 0; i < process.env.ADV.length; i++) {
        if(pass === process.env.ADV[i]) {
            completion = await client.chat.completions.create({
                model: "gpt-4o-audio-preview",
                modalities: ["text", "audio"],
                audio: { voice: "alloy", format: "mp3" },
                messages: [
                    {
                        role: "system",
                        content: systemContent,
                    },
                    {
                        role: "user",
                        content: tts_text,
                    }
                ],
            });
        }
    }
    const mp3Bytes = base64.toByteArray(completion.choices[0].message.audio.data);
    fs.writeFileSync(speechFilePath, mp3Bytes);
}

async function generateImage(config = {}, other = {}) {
    let proceed = await warn();
    if(!proceed) {
        return "Image generation cancelled.";
    }
    let newOther = {
        file: false,
        path: '',
        name: ''
    };
    newOther = { ...newOther, ...other };

    let newConfig = {
        model: 'dall-e-3',
        prompt: '',
        n: 1,
        size: '1024x1024',
        response_format: 'url'
    };

    newConfig = { ...newConfig, ...config };

    const completion = await client.images.generate(newConfig);

    if(newOther.file) {
        const imageUrl = completion.data[0].url;
        const fetch = (await import('node-fetch')).default;
        const imageResponse = await fetch(imageUrl);
        const imageBuffer = Buffer.from(await imageResponse.arrayBuffer());
        const fileName = newOther.fileName ? newOther.fileName : `generated_image.png`;
        const filePath = newOther.path ? path.join(newOther.path, fileName) : path.join(generatedImgsDir, fileName);

        fs.writeFileSync(filePath, imageBuffer);
        console.log(`Image saved as ${filePath}`);
    }

    return completion.data[0].url;
}

function updateSystemInstructions(chatName, newInstructions) {
    const chatPath = path.join('./conversations', `${chatName}.txt`);
    if (!fs.existsSync(chatPath)) {
        console.log('Chat not found.');
        return;
    }
    const chatData = fs.readFileSync(chatPath, 'utf8');
    const messages = JSON.parse(chatData);
    messages.forEach(message => {
        if (message.role === 'system') {
            message.content = newInstructions;
        }
    });
    fs.writeFileSync(chatPath, JSON.stringify(messages, null, 2));
    console.log('System instructions updated.');
}

export const chat = {
    cmd: cmdChat,
    getResponse,
    get: getChat,
    delete: deleteChat,
    list: listChats,
    updateSystemInstructions
};

export const audio = {
    generate: generateAudio
};

export const image = {
    generate: generateImage
};