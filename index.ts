import express from "express";
import multer from "multer";
import axios from "axios";
import fs from "fs";
import FormData from "form-data";
import cors from "cors";

import { PollyClient, SynthesizeSpeechCommand } from "@aws-sdk/client-polly";
import { configDotenv } from "dotenv";
configDotenv();

const app = express();
const storage = multer.diskStorage({
  destination: function (req, file, callback) {
    callback(null, process.cwd() + "/audio/input");
  },
  filename: function (req, file, callback) {
    callback(null, file.fieldname + ".m4a");
  },
});
const upload = multer({ storage: storage });
app.use(cors());
app.get("/", function (req, res) {
  res.send("Your server is running!");
});

app.post("/", upload.single("audio"), async function (req, res) {
  if (
    req.file?.path &&
    process.env.AWS_ACCESS_KEY &&
    process.env.AWS_SECRET_KEY &&
    process.env.DEEPINFRA_KEY
  ) {
    const headersList = {
      Authorization: `Bearer ${process.env.DEEPINFRA_KEY}`,
    };
    const formdata = new FormData();
    formdata.append("audio", fs.createReadStream(req.file?.path));
    let reqOptions = {
      url: "https://api.deepinfra.com/v1/inference/openai/whisper-medium.en",
      method: "POST",
      headers: headersList,
      data: formdata,
    };
    const transcribedResponse = await axios.request(reqOptions);
    const prompt = `[INST] <<SYS>> Initiate AIDEN, the AI assistant created by Sudhanshu Makwana & Megha Kawad. AIDEN combines a professional attitude with a friendly touch, making interactions both efficient and enjoyable. It speaks clearly and concisely, avoiding technical jargon unless necessary. At its core, AIDEN values user privacy and operates with ethical integrity, ensuring unbiased and respectful communication in every interaction. <<SYS>> ${transcribedResponse.data.text} [/INST]`;
    const response = await fetch(
      "https://api.deepinfra.com/v1/inference/mistralai/Mixtral-8x7B-Instruct-v0.1",
      {
        method: "POST",
        body: JSON.stringify({
          input: prompt,
        }),
        headers: headersList,
      }
    );
    const data = await response.json();
    const pollyClient = new PollyClient({
      region: "us-east-1",
      credentials: {
        accessKeyId: process.env.AWS_ACCESS_KEY,
        secretAccessKey: process.env.AWS_SECRET_KEY,
      },
    });

    const pollyCommand = new SynthesizeSpeechCommand({
      Engine: "long-form",
      LanguageCode: "en-US",
      OutputFormat: "mp3",
      Text: data.results[0].generated_text,
      TextType: "text",
      VoiceId: "Ruth",
    });
    const pollyResponse = await pollyClient.send(pollyCommand);
    const audioData = pollyResponse.AudioStream;
    if (!audioData) {
      throw new Error("No audio stream returned from AWS Polly request.");
    }
    const outputPath = process.cwd() + "/audio/output/audio.mp3";
    fs.writeFileSync(outputPath, await audioData.transformToByteArray());
    res.sendFile(outputPath);
  } else {
    res.status(500).send("Internal server error");
  }
});

app.listen(8000, function () {
  console.log("Your server is running on port 8000");
});
