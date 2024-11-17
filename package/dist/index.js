import openai from 'openai';
import 'dotenv/config';
import { writeFile } from 'fs/promises';
writeFile('../../.env', `# Define your OpenAI API key here like this: OAI_API_KEY="your-api-key"`);

const gconfig = {
    apiKey: process.env.OAI_API_KEY
};

const client = new openai.OpenAI(gconfig);

console.log(openai);

function getResponse(config) {
    if(config.type === 'chat') {
        return client.chat.completions.create({
            engine: config.model,
            messages: config.sysInstructions != "" ? 
            config.messages
                .toSpliced(0, 0, { role: 'system', content: config.sysInstructions })
                .push({ role: 'user', content: config.message }) :
            config.messages
                .push({ role: 'user', content: config.message })
            ,
            max_tokens: config.maxTokens,
        });
    }
}

module.exports = {
    getResponse
};