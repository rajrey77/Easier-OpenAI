import fs from 'fs';
import dotenv from 'dotenv';
import { writeFile } from 'fs/promises';
import readline from 'readline';
import path from 'path';
import base64 from 'base64-js';
import { OpenAI } from 'openai';
dotenv.config();

const envFilePath = './.env';
if (!fs.existsSync(envFilePath)) {
    const defaultEnvContent = `OPENAI_API_KEY="your_api_key_here"\nDISABLE_WARNING="false" # Enable at your own risk. Some OpenAI models are [very] expensive to use.`;
    fs.writeFileSync(envFilePath, defaultEnvContent);
    console.log('.env file created. Please fill in the API key.');
}

const gconfig = {
    apiKey: process.env.OPENAI_API_KEY
};

const persistentFilePath = path.join(path.dirname(''), 'persistentData.json');

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

const responsesDir = './responses';
if (!fs.existsSync(responsesDir)) {
    fs.mkdirSync(responsesDir);
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
const client = new OpenAI(gconfig);

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
        attachImage: false,
        imagePath: '',
        test: false,
        saveResponse: false,
        responseFileName: ''
    };

    config = { ...defaultConfig, ...config };

    const newPromise = new Promise(async (resolve, reject) => {
        try {
            let userPrompt = {  role: "user", content: config.prompt };
            let response;
            
            async function encodeImage(imagePath) {
                const imageBuffer = fs.readFileSync(imagePath);
                return base64.fromByteArray(new Uint8Array(imageBuffer));
            }
            
            const imagePath = config.imagePath;

            if (config.type === 'chat') {
                function changeMsgs(msgs) {
                    let newMsgs = msgs.toSpliced(0, 0, { role: 'system', content: config.sysInstructions });
                    newMsgs.push(userPrompt);
                    console.log(newMsgs);
                    return newMsgs;
                }
                let messages = config.messages;
                if(config.attachImage) {
                    if(Array.isArray(imagePath)) {
                        let messagesPush = { role: "user", content: [ 
                            { type: "text", text: config.prompt },
                        ]};
                        for(const img of imagePath) {
                            const imgObj = 
                                { type: "image_url", image_url: { url: `data:image/${path.extname(img).slice(1)};base64,${await encodeImage(img)}` } }
                            messagesPush.content.push(imgObj);
                        }
                        messages.push(messagesPush);
                    }else{
                        const contArr = [
                            { type: "text", text: config.prompt },
                            { type: "image_url", image_url: { url: `data:image/${path.extname(config.imagePath).slice(1)};base64,${await encodeImage(imagePath)}` } }
                        ];
                        messages.push({ role: 'user', content: contArr });
                    }
                }
                response = await client.chat.completions.create({
                    model: config.model,
                    messages: config.sysInstructions === "" ? messages : changeMsgs(config.messages),
                    max_tokens: config.maxTokens
                });
            } else if (config.type === 'completion') {
                response = await client.completions.create({
                    model: config.model,
                    prompt: userPrompt,
                    max_tokens: config.maxTokens
                });
            } else if (config.type === 'embedding') {
                response = await client.embeddings.create({
                    model: config.model,
                    input: userPrompt
                });
            }
            
            resolve(response);
        } catch (e) {
            reject(e);
        }
    });
    const response_1 = await newPromise;
    if (config.test) {
        if(config.saveResponse) {
            const responseFilePath = path.join(responsesDir, config.responseFileName == "" ? `${config.model}-${Date.now()}.json` : `${config.responseFileName}.${path.extname(config.responseFileName) == "" ? 'json' : path.extname(config.responseFileName)}`);
            fs.writeFileSync(responseFilePath, JSON.stringify(response_1, null, 2));
        }
        return await response_1;
    } else {
        if(config.saveResponse) {
            const responseFilePath = path.join(responsesDir, config.responseFileName == "" ? `${config.model}-${Date.now()}.json` : `${config.responseFileName}.${path.extname(config.responseFileName) == "" ? 'json' : path.extname(config.responseFileName)}`);
            fs.writeFileSync(responseFilePath, JSON.stringify(response_1.choices[0].message.content, null, 2));
        }
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
            writeFile(`./conversations/${name}.txt`, JSON.stringify(messages, null, 2)).then(() => {
                console.log('Conversation saved.');
            }).catch(err => {
                throw err;
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
        fileName: ''
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

function logUsage(endpoint, model, tokens) {
    const logFilePath = path.join(path.dirname(''), 'usage.log');
    const logEntry = `${new Date().toISOString()} - Endpoint: ${endpoint}, Model: ${model}, Tokens: ${tokens}\n`;
    fs.appendFileSync(logFilePath, logEntry);
    console.log('Usage logged.');
}

async function improvePrompt(prompt, tokens, reasoning) {
    const improvedPrompt = await getResponse(reasoning ? {
        prompt,
        messages: [
            { role: 'user', content: 'John is available at 12:30 to 2:00. Lisa is available from 11:00 to 1:30. Daniel is available from 1:30 to 3:00. Find a time for a 30 minute meeting for all 3 of them.' },
            { role: 'assistant', content: `
                **Original Prompt**:  
                "John is available at 12:30 to 2:00. Lisa is available from 11:00 to 1:30. Daniel is available from 1:30 to 3:00. Find a time for a 30 minute meeting for all 3 of them."
                
                **Identified Issues**:  
                - **Complexity and Clarity**: The prompt involves multiple time slots that are not immediately intuitive to reconcile. It requires careful analysis to determine a common time block.
                - **Ambiguity**: The instructions do not specify whether to find the earliest possible meeting time or if any time slot will do.
                - **Lack of Structure**: The prompt doesn’t guide the responder toward a specific format for the answer.
                - **No Additional Instructions**: It could benefit from indicating what to do if no common time is found.
                
                **Improved Prompt**:  
                "Determine a time slot for a 30-minute meeting that accommodates the schedules of John, Lisa, and Daniel. Consider the following availability:
                - John: 12:30 PM - 2:00 PM
                - Lisa: 11:00 AM - 1:30 PM
                - Daniel: 1:30 PM - 3:00 PM
                
                Please:
                1. Identify any overlaps in their schedules allowing for a 30-minute meeting.
                2. Suggest the earliest possible time for the meeting.
                3. If no common time exists, state this clearly and suggest alternatives if feasible.
                Present your findings in a concise format, clearly stating the time for the proposed meeting or summarizing your conclusion."
                
                **Reasoning Behind Changes**:  
                - **Complexity Simplification**: By requesting an identified overlap, it makes it easier to deduce shared availability.
                - **Added Specificity**: By specifying the need for the earliest possible time, it adds a prioritization to the solution process.
                - **Answer Format Guidance**: By instructing a clear format for presentation, it ensures a structured response.
                - **Handling of No Solution Scenarios**: By including instructions on what to do if no time is available, it preempts potential confusion in case there’s no overlap.`
            }
        ],
        sysInstructions: `
Generate a detailed guide with specific suggestions to improve a given prompt using prompt engineering.

Analyze the provided prompt to determine its purpose, identify areas for potential improvements, provide alternative formulations, and enhance clarity, engagement, and effectiveness.

# Steps

1. **Understand the Initial Prompt**: Carefully read and understand what the provided prompt is trying to achieve, its target objective, and desired outcome. Break down the intent if needed.
2. **Identify Issues and Scope for Improvement**: Highlight areas where the prompt may be lacking (e.g. clarity, conciseness, specificity, tone). Look for:
   - **Clarity Issues**: Is the intent of the prompt clear?
   - **Detail Level**: Does the prompt need more examples or additional context?
   - **Ambiguity**: Are there any vague instructions that may lead to different or incorrect outcomes?
   - **Structure**: Is the output format well-defined?
   - **Additional Context**: Is broader context required for better performance?
3. **Rewrite Improvements**: Revise the prompt with detailed changes that address the shortcomings. Describe how these changes will make the prompt more effective and why they are needed.
4. **Add Specific Examples**: Where appropriate, suggest specific examples, and include placeholders to guide a consistent output for varied scenarios.
5. **Optional Enhancements**: Provide details on optional components or bonus refinements to further elevate the prompt (e.g., including reasoning steps if applicable). 

# Output Format

Respond in sections:
1. **Original Prompt**: Include the original prompt as provided.
2. **Identified Issues**: List out specific areas in need of improvement.
3. **Improved Prompt**: Provide the updated version of the prompt.
4. **Reasoning Behind Changes**: Explain why each change was made and how it will improve the prompt's overall efficacy in achieving its goal.

# Example

**Original Prompt**:  
"Describe a situation in which you were proud of your accomplishments."

**Identified Issues**:  
- **Lack of Clarity**: The instruction is vague. What type of accomplishment does it refer to? Is it personal or professional?
- **Needs Better Context**: Including more context would guide the user better, e.g., timeline, scale of accomplishment.
- **No Output Format Guidance**: The output requirements (length, tone, specific details required) are not clearly defined.

**Improved Prompt**:  
"Think of a personal or professional accomplishment from the past three years that made you feel proud. Provide a detailed account, including:
  - What the accomplishment was.
  - The steps you took to achieve it.
  - What obstacles you faced and how you overcame them.
Write in 4-5 sentences. Aim for a positive and reflective tone."

**Reasoning Behind Changes**:  
- **Specification**: Narrowing down "personal or professional" helps contextualize the prompt.
- **Timeline**: Adding a 'past three years' horizon provides a clear boundary, making it easier to think of examples.
- **Guidance on Detail**: Instructing the user which aspects to describe adds structure to the response.
- **Output Parameters**: Specifying length and tone helps ensure consistency and matches the desired level of response. 

# Notes

- Always consider incorporating parameters for output format and tone, especially when the initial prompt is open-ended.
- Ensure that revisions maintain the alignment with the original intent while enhancing overall clarity and engagement.
        `,
        maxTokens: tokens
    } : {
        prompt,
        messages: [
            { role: 'user', content: 'John is available at 12:30 to 2:00. Lisa is available from 11:00 to 1:30. Daniel is available from 1:30 to 3:00. Find a time for a 30 minute meeting for all 3 of them.' },
            { role: 'assistant', content: `
Determine a time slot for a 30-minute meeting that accommodates the schedules of John, Lisa, and Daniel. Consider the following availability:
- John: 12:30 PM - 2:00 PM
- Lisa: 11:00 AM - 1:30 PM
- Daniel: 1:30 PM - 3:00 PM

Please:
1. Identify any overlaps in their schedules allowing for a 30-minute meeting.
2. Suggest the earliest possible time for the meeting.
3. If no common time exists, state this clearly and suggest alternatives if feasible.
Present your findings in a concise format, clearly stating the time for the proposed meeting or summarizing your conclusion.    
            `}
        ],
        sysInstructions: `
Generate a detailed guide with specific suggestions to improve a given prompt using prompt engineering.

Analyze the provided prompt to determine its purpose, identify areas for potential improvements, provide alternative formulations, and enhance clarity, engagement, and effectiveness.

# Steps

1. **Understand the Initial Prompt**: Carefully read and understand what the provided prompt is trying to achieve, its target objective, and desired outcome. Break down the intent if needed.
2. **Identify Issues and Scope for Improvement**: Highlight areas where the prompt may be lacking (e.g. clarity, conciseness, specificity, tone). Look for:
   - **Clarity Issues**: Is the intent of the prompt clear?
   - **Detail Level**: Does the prompt need more examples or additional context?
   - **Ambiguity**: Are there any vague instructions that may lead to different or incorrect outcomes?
   - **Structure**: Is the output format well-defined?
   - **Additional Context**: Is broader context required for better performance?
3. **Rewrite Improvements**: Revise the prompt with detailed changes that address the shortcomings. Describe how these changes will make the prompt more effective and why they are needed.
4. **Add Specific Examples**: Where appropriate, suggest specific examples, and include placeholders to guide a consistent output for varied scenarios.
5. **Optional Enhancements**: Provide details on optional components or bonus refinements to further elevate the prompt (e.g., including reasoning steps if applicable). 

# Notes

- Always consider incorporating parameters for output format and tone, especially when the initial prompt is open-ended.
- Ensure that revisions maintain the alignment with the original intent while enhancing overall clarity and engagement.
- Only share the improved prompt with the user, nothing else.
        `,
        maxTokens: tokens
    });
    return await improvedPrompt;
}

const chat = {
    cmd: cmdChat,
    getResponse,
    get: getChat,
    delete: deleteChat,
    list: listChats,
    updateSystemInstructions
};

const audio = {
    generate: generateAudio
};

const image = {
    generate: generateImage
};

const utils = {
    logUsage,
    improvePrompt
};

export {
    chat,
    audio,
    image,
    utils
};
