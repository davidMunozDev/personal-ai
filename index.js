import { ChatOpenAI } from "@langchain/openai";
import { PromptTemplate } from "@langchain/core/prompts";
import { StringOutputParser } from "@langchain/core/output_parsers";
import {
  RunnablePassthrough,
  RunnableSequence,
} from "@langchain/core/runnables";
import dbRetriever from "./utils/dbRetriever";
import { combineDocuments } from "./utils/combineDocuments";
import formatAiMessages from "./utils/formatAiMessages";
import { addChatbotMessages } from "./utils/addChatbotMessages";
import config from "./config";

const {
  errorMessage,
  llmModel,
  apiKey,
  temperature,
  questionTemplate,
  answerTemplate,
} = config;

export async function sendMessage(state, message) {
  try {
    const response = await getAIResponse(message, state);

    return addChatbotMessages(state, message, response);
  } catch {
    return addChatbotMessages(state, message, errorMessage);
  }
}

async function getAIResponse(question, messages) {
  const llm = new ChatOpenAI({
    apiKey,
    temperature,
    modelName: llmModel,
  });

  const retrieverChain = RunnableSequence.from([
    (prevResult) => prevResult.question,
    dbRetriever,
    combineDocuments,
  ]);

  const chain = RunnableSequence.from([
    {
      question: createQuestionChain(llm),
      original_input: new RunnablePassthrough(),
    },
    {
      context: retrieverChain,
      question: ({ original_input }) => original_input.question,
      messages: ({ original_input }) => original_input.messages,
    },
    createAnswerChain(llm),
  ]);

  return await chain.invoke({
    question,
    messages: formatAiMessages(messages),
  });
}

const createQuestionChain = (llm) => {
  const template = `${questionTemplate} 
    conversation history: {messages}
    question: {question} 
    standalone question:`;

  const questionPrompt = PromptTemplate.fromTemplate(template);

  return questionPrompt.pipe(llm).pipe(new StringOutputParser());
};

const createAnswerChain = (llm) => {
  const template = `${answerTemplate}
    context: {context}
    conversation history: {messages}
    question: {question}
    answer: `;

  const answerPrompt = PromptTemplate.fromTemplate(template);

  return answerPrompt.pipe(llm).pipe(new StringOutputParser());
};
