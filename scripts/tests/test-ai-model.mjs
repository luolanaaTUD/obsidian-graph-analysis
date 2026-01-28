import { GoogleGenAI, Type } from "@google/genai";
import { loadEnv } from '../utils/load-env.mjs';

// Load environment variables from .env files
loadEnv();

// Get API key from environment variables
const apiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_GENAI_API_KEY;
if (!apiKey) {
  console.error("Please set GEMINI_API_KEY or GOOGLE_GENAI_API_KEY environment variable.");
  console.error("You can either:");
  console.error("  1. Set it in a .env or .env.local file in the project root");
  console.error("  2. Pass it as an environment variable: GEMINI_API_KEY=your_key_here npm run test:ai");
  process.exit(1);
}
const ai = new GoogleGenAI({ apiKey });

// Model configuration (easy to change)
const TEMPERATURE = 0.3;
const TOP_P = 0.72;

const system = "You are an expert in knowledge management. You are highly skilled in applying graph theory and network analysis to knowledge graphs. Use your expertise to extract insights from the provided context which contains knowledge domains and centrality rankings. Please focus on network analysis and determining knowledge gaps.";

const context = `VAULT ANALYSIS DATA:
{"generatedAt":"2025-07-19T10:38:04.811Z","totalFiles":49,"apiProvider":"Google Gemini","tokenUsage":{"promptTokens":16810,"candidatesTokens":3178,"totalTokens":19988},"results":[{"id":"add_new_note_for_testing_md","title":"Add New Note for Testing","summary":"Note is empty or too short for semantic analysis","keywords":"","knowledgeDomains":[],"created":"2025-04-27T09:28:27.256Z","modified":"2025-04-27T09:28:27.256Z","path":"Add New Note for Testing.md","wordCount":0,"graphMetrics":{"degreeCentrality":0,"betweennessCentrality":0,"closenessCentrality":0,"eigenvectorCentrality":1.4349607420543208e-26},"centralityRankings":{"betweennessRank":49,"closenessRank":49,"eigenvectorRank":49,"degreeRank":49}},{"id":"ai_ethics_md","title":"AI_Ethics","summary":"This note discusses AI ethics, highlighting the increasing importance of ethical implications in AI development as systems become more powerful. It covers key concerns like bias, privacy, automation, and safety, and emphasizes the need for transparency, fairness, and accountability in responsible AI development, noting that ethical considerations must keep pace with technical developments.","keywords":"AI ethics, bias, privacy, automation, safety, responsible development","knowledgeDomains":["Political ethics","Religious ethics","Civil and political rights"],"created":"2025-03-21T08:16:08.697Z","modified":"2025-05-09T09:37:36.909Z","path":"AI_Ethics.md","wordCount":91,"graphMetrics":{"degreeCentrality":0.1875,"betweennessCentrality":0.11103703614240441,"closenessCentrality":0.37878787878787873,"eigenvectorCentrality":0.3424555770254946},"centralityRankings":{"betweennessRank":5,"closenessRank":2,"eigenvectorRank":4,"degreeRank":7}},{"id":"ai_ethics_copy_md","title":"AI_Ethics copy","summary":"This note discusses AI ethics, highlighting the increasing importance of ethical implications in AI development as systems become more powerful. It covers key concerns like bias, privacy, automation, and safety, and emphasizes the need for transparency, fairness, and accountability in responsible AI development, noting that ethical considerations must keep pace with technical developments.","keywords":"AI ethics, bias, privacy, automation, safety, responsible development","knowledgeDomains":["Political ethics","Religious ethics","Civil and political rights"],"created":"2025-03-21T08:10:04.175Z","modified":"2025-03-21T08:10:04.176Z","path":"AI_Ethics copy.md","wordCount":90,"graphMetrics":{"degreeCentrality":0.08333333333333333,"betweennessCentrality":0.06717687074829931,"closenessCentrality":0.3115264797507788,"eigenvectorCentrality":0.16927860573544065},"centralityRankings":{"betweennessRank":12,"closenessRank":10,"eigenvectorRank":10,"degreeRank":13}},{"id":"ai_history_md","title":"AI_History","summary":"Note is empty or too short for semantic analysis","keywords":"","knowledgeDomains":[],"created":"2025-03-21T08:17:09.863Z","modified":"2025-07-17T02:26:44.975Z","path":"AI_History.md","wordCount":0,"graphMetrics":{"degreeCentrality":0.041666666666666664,"betweennessCentrality":0.03458049886621315,"closenessCentrality":0.2873563218390805,"eigenvectorCentrality":0.08797041418980416},"centralityRankings":{"betweennessRank":31,"closenessRank":19,"eigenvectorRank":17,"degreeRank":35}},{"id":"ai_history_1_md","title":"AI_History 1","summary":"Note is empty or too short for semantic analysis","keywords":"","knowledgeDomains":[],"created":"2025-05-12T10:38:49.149Z","modified":"2025-05-12T10:39:12.967Z","path":"AI_History 1.md","wordCount":2,"graphMetrics":{"degreeCentrality":0.020833333333333332,"betweennessCentrality":0.03401360544217687,"closenessCentrality":0.228310502283105,"eigenvectorCentrality":0.024337966890978488},"centralityRankings":{"betweennessRank":41,"closenessRank":40,"eigenvectorRank":25,"degreeRank":41}},{"id":"ai_neural_networks_md","title":"AI_Neural_Networks","summary":"This note introduces neural networks as computational models inspired by the human brain, forming the backbone of modern AI systems. It covers key concepts like neurons, layers, activation functions, backpropagation, and deep learning, and lists applications in image recognition, natural language processing, and autonomous systems.","keywords":"neural networks, neurons, layers, activation functions, backpropagation, deep learning","knowledgeDomains":["Computer science","Conscious mental processes & intelligence","Physiology & related subjects"],"created":"2025-03-21T08:16:08.710Z","modified":"2025-05-12T10:37:53.624Z","path":"AI_Neural_Networks.md","wordCount":69,"graphMetrics":{"degreeCentrality":0.3125,"betweennessCentrality":0.3258310856303314,"closenessCentrality":0.4219409282700422,"eigenvectorCentrality":0.4191692665073528},"centralityRankings":{"betweennessRank":1,"closenessRank":1,"eigenvectorRank":1,"degreeRank":1}},{"id":"ai_neural_networks_copy_md","title":"AI_Neural_Networks copy","summary":"This note introduces neural networks as computational models inspired by the human brain, forming the backbone of modern AI systems. It covers key concepts like neurons, layers, activation functions, backpropagation, and deep learning, and lists applications in image recognition, natural language processing, and autonomous systems.","keywords":"neural networks, neurons, layers, activation functions, backpropagation, deep learning","knowledgeDomains":["Computer science","Conscious mental processes & intelligence","Physiology & related subjects"],"created":"2025-03-21T08:10:04.172Z","modified":"2025-03-21T08:10:04.172Z","path":"AI_Neural_Networks copy.md","wordCount":67,"graphMetrics":{"degreeCentrality":0.125,"betweennessCentrality":0.04523809523809524,"closenessCentrality":0.30303030303030304,"eigenvectorCentrality":0.19269369822743712},"centralityRankings":{"betweennessRank":14,"closenessRank":13,"eigenvectorRank":9,"degreeRank":9}},{"id":"ancient_civilizations_md","title":"Ancient_Civilizations","summary":"Note is empty or too short for semantic analysis","keywords":"","knowledgeDomains":[],"created":"2025-03-21T08:16:53.680Z","modified":"2025-03-21T08:19:40.061Z","path":"Ancient_Civilizations.md","wordCount":0,"graphMetrics":{"degreeCentrality":0.041666666666666664,"betweennessCentrality":0.035920470431339994,"closenessCentrality":0.24875621890547261,"eigenvectorCentrality":0.004235300722343914},"centralityRankings":{"betweennessRank":17,"closenessRank":35,"eigenvectorRank":39,"degreeRank":34}},{"id":"ancient_greece_md","title":"Ancient_Greece","summary":"Note is empty or too short for semantic analysis","keywords":"","knowledgeDomains":[],"created":"2025-03-21T08:19:40.061Z","modified":"2025-03-21T08:19:40.061Z","path":"Ancient_Greece.md","wordCount":0,"graphMetrics":{"degreeCentrality":0.041666666666666664,"betweennessCentrality":0.035920470431339994,"closenessCentrality":0.24875621890547261,"eigenvectorCentrality":0.004235300722343914},"centralityRankings":{"betweennessRank":16,"closenessRank":34,"eigenvectorRank":38,"degreeRank":33}},{"id":"ancient_rome_md","title":"Ancient_Rome","summary":"This note describes Ancient Rome, highlighting its significance as one of the largest and most influential civilizations in world history. It outlines major periods like the Roman Republic and Empire, notable elements such as architecture, military conquests, and the legal system, and the cultural impact seen in modern law, architecture, and European languages.","keywords":"Ancient Rome, Roman Empire, Roman Republic, architecture, military, law","knowledgeDomains":["Italy & adjacent territories","World history","Architecture from earliest times to ca. 300"],"created":"2025-03-21T08:16:08.721Z","modified":"2025-04-30T04:05:03.078Z","path":"Ancient_Rome.md","wordCount":85,"graphMetrics":{"degreeCentrality":0.25,"betweennessCentrality":0.31354397414180024,"closenessCentrality":0.32679738562091504,"eigenvectorCentrality":0.022632267401769136},"centralityRankings":{"betweennessRank":2,"closenessRank":7,"eigenvectorRank":26,"degreeRank":3}},{"id":"ancient_rome_copy_md","title":"Ancient_Rome copy","summary":"This note describes Ancient Rome, highlighting its significance as one of the largest and most influential civilizations in world history. It outlines major periods like the Roman Republic and Empire, notable elements such as architecture, military conquests, and the legal system, and the cultural impact seen in modern law, architecture, and European languages.","keywords":"Ancient Rome, Roman Empire, Roman Republic, architecture, military, law","knowledgeDomains":["Italy & adjacent territories","World history","Architecture from earliest times to ca. 300"],"created":"2025-03-21T08:10:04.169Z","modified":"2025-03-21T08:19:34.385Z","path":"Ancient_Rome copy.md","wordCount":74,"graphMetrics":{"degreeCentrality":0.20833333333333334,"betweennessCentrality":0.08016388373531232,"closenessCentrality":0.24154589371980675,"eigenvectorCentrality":0.006812956300723094},"centralityRankings":{"betweennessRank":8,"closenessRank":36,"eigenvectorRank":30,"degreeRank":4}},{"id":"book_review_ai_md","title":"Book_Review_AI","summary":"This note is a book review of \"AI Superpowers,\" highlighting its perspective on AI development and competition. It discusses key takeaways such as the global AI race, data advantages, cultural impacts, and future predictions, connecting them to AI ethics and deep learning applications, and noting the alignment of practical applications with current trends in data science.","keywords":"book review, AI Superpowers, AI race, data advantages, cultural impacts, data science","knowledgeDomains":["Computer science","Political ethics","History, description & criticism"],"created":"2025-03-21T08:16:08.734Z","modified":"2025-03-21T08:16:08.735Z","path":"Book_Review_AI.md","wordCount":58,"graphMetrics":{"degreeCentrality":0.0625,"betweennessCentrality":0.03401360544217687,"closenessCentrality":0.2849002849002849,"eigenvectorCentrality":0.14649362757062107},"centralityRankings":{"betweennessRank":40,"closenessRank":20,"eigenvectorRank":11,"degreeRank":16}}]}
`;

const instruction = `Analyze the vault data to identify key knowledge domains using network centrality metrics. Return a JSON object matching the required schema.

**Network Analysis Framework:**
- **Knowledge Bridges** (Betweenness Centrality): Domains that connect disparate knowledge areas and facilitate interdisciplinary thinking
- **Knowledge Foundations** (Closeness Centrality): Core domains that are central to the knowledge network and serve as conceptual starting points  
- **Knowledge Authorities** (Eigenvector Centrality): Domains representing areas of expertise with deep interconnections to other important concepts

**Instructions:**
1. Identify top-ranking domains for each centrality type based on the provided data
2. For each domain, compute the total count of notes that contribute to the domain, average centrality score, and output top 3 notes for each domain
3. Explain why each domain qualifies as a bridge/foundation/authority based on its network position
4. Use only domains explicitly present in the vault data - do not invent domains
5. Treat domains as independent entities (multiple domains from one note are separate)`;

const prompt = `${system}\n\n${context}\n\n${instruction}`;

// Define the response schema for structured output
const responseSchema = {
  type: Type.OBJECT,
  properties: {
    knowledgeNetwork: {
      type: Type.OBJECT,
      properties: {
        bridges: {
          type: Type.ARRAY,
          items: {
            type: Type.OBJECT,
            properties: {
              domain: { type: Type.STRING },
              noteCount: { type: Type.NUMBER },
              averageScore: { type: Type.NUMBER },
              explanation: { type: Type.STRING },
              topNotes: {
                type: Type.ARRAY,
                items: {
                  type: Type.OBJECT,
                  properties: {
                    title: { type: Type.STRING },
                    path: { type: Type.STRING },
                    rank: { type: Type.NUMBER }
                  },
                  propertyOrdering: ["title", "path", "rank"]
                }
              },
              connections: {
                type: Type.ARRAY,
                items: { type: Type.STRING }
              },
              insights: { type: Type.STRING }
            },
            propertyOrdering: ["domain", "noteCount", "averageScore", "explanation", "topNotes", "connections", "insights"]
          }
        },
        foundations: {
          type: Type.ARRAY,
          items: {
            type: Type.OBJECT,
            properties: {
              domain: { type: Type.STRING },
              noteCount: { type: Type.NUMBER },
              averageScore: { type: Type.NUMBER },
              explanation: { type: Type.STRING },
              topNotes: {
                type: Type.ARRAY,
                items: {
                  type: Type.OBJECT,
                  properties: {
                    title: { type: Type.STRING },
                    path: { type: Type.STRING },
                    rank: { type: Type.NUMBER }
                  },
                  propertyOrdering: ["title", "path", "rank"]
                }
              },
              coverage: {
                type: Type.ARRAY,
                items: { type: Type.STRING }
              },
              insights: { type: Type.STRING }
            },
            propertyOrdering: ["domain", "noteCount", "averageScore", "explanation", "topNotes", "coverage", "insights"]
          }
        },
        authorities: {
          type: Type.ARRAY,
          items: {
            type: Type.OBJECT,
            properties: {
              domain: { type: Type.STRING },
              noteCount: { type: Type.NUMBER },
              averageScore: { type: Type.NUMBER },
              explanation: { type: Type.STRING },
              topNotes: {
                type: Type.ARRAY,
                items: {
                  type: Type.OBJECT,
                  properties: {
                    title: { type: Type.STRING },
                    path: { type: Type.STRING },
                    rank: { type: Type.NUMBER }
                  },
                  propertyOrdering: ["title", "path", "rank"]
                }
              },
              influence: {
                type: Type.ARRAY,
                items: { type: Type.STRING }
              },
              insights: { type: Type.STRING }
            },
            propertyOrdering: ["domain", "noteCount", "averageScore", "explanation", "topNotes", "influence", "insights"]
          }
        }
      },
      propertyOrdering: ["bridges", "foundations", "authorities"]
    },
    knowledgeGaps: {
      type: Type.ARRAY,
      items: { type: Type.STRING }
    }
  },
  propertyOrdering: ["knowledgeNetwork", "knowledgeGaps"]
};

async function main() {
  console.log("\n--- SENDING SYSTEM + CONTEXT + INSTRUCTION PROMPT (STRUCTURED OUTPUT) ---\n");
  const response = await ai.models.generateContent({
    model: "gemini-flash-lite-latest",
    contents: prompt,
    config: {
      responseMimeType: "application/json",
      responseSchema,
      thinkingConfig: {
        thinkingBudget: 0, // Disables thinking
      },
      temperature: TEMPERATURE,
      topP: TOP_P
    }
  });
  console.log(response.text); // This will be valid JSON
  if (response.usageMetadata) {
    if (response.usageMetadata.promptTokenCount !== undefined) {
      console.log("\n[Token Usage] Prompt tokens used:", response.usageMetadata.promptTokenCount);
    }
    if (response.usageMetadata.totalTokenCount !== undefined) {
      console.log("[Token Usage] Total tokens used:", response.usageMetadata.totalTokenCount);
    }
  }
}

main();
