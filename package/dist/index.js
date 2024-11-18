import openai from 'openai';
import 'dotenv/config';
import { writeFile } from 'fs/promises';

const gconfig = {
    apiKey: process.env.OPENAI_API_KEY
};

const client = new openai.OpenAI(gconfig);

function getResponse(config, test = false) {
    const newPromise = new Promise(async (resolve, reject) => {
        try {
            if(config.type === 'chat') {
                function changeMsgs(msgs) {
                    let newMsgs = msgs.toSpliced(0, 0, { role: 'system', content: config.sysInstructions });
                    newMsgs.push({ role: 'user', content: config.prompt });
                    console.log(newMsgs);
                    return newMsgs;
                }
                let messages = config.messages;
                messages.push({ role: 'user', content: config.prompt });

                let response;
                response = await client.chat.completions.create({
                    model: config.model,
                    messages: config.sysInstructions == "" ? messages : changeMsgs(config.messages),
                    max_tokens: config.maxTokens,
                });
                resolve(response);
            }
        } catch(e) {
            reject(e);
        }
    });
    if(test) {
        return newPromise;
    } else {
        return newPromise.then((response) => {
            return response.choices[0].message.content;
        });
    }
}

export { getResponse };