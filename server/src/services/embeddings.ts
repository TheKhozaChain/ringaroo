import OpenAI from 'openai';
import { appConfig } from '@/config';

export interface EmbeddingResult {
  embedding: number[];
  tokenCount: number;
}

export interface KnowledgeContent {
  text: string;
  metadata: Record<string, any>;
}

export class EmbeddingsService {
  private openai: OpenAI;
  private readonly embeddingModel: string;
  private readonly maxTokensPerChunk = 512; // Optimal for text-embedding-3-small

  constructor() {
    this.openai = new OpenAI({
      apiKey: appConfig.openaiApiKey,
    });
    this.embeddingModel = appConfig.openaiEmbeddingModel;
  }

  /**
   * Generate embedding for a single text chunk
   */
  async generateEmbedding(text: string): Promise<EmbeddingResult> {
    if (appConfig.openaiApiKey === 'sk-demo-key-for-testing') {
      console.log('Demo mode - generating mock embedding');
      return this.generateMockEmbedding(text);
    }

    try {
      console.log(`Generating embedding for text: "${text.substring(0, 100)}..."`);
      
      const response = await this.openai.embeddings.create({
        model: this.embeddingModel,
        input: text.trim(),
      });

      if (!response.data || response.data.length === 0) {
        throw new Error('No embedding data returned from OpenAI');
      }

      const embedding = response.data[0];
      console.log(`Generated ${embedding?.embedding?.length}-dimensional embedding`);

      return {
        embedding: embedding?.embedding || [],
        tokenCount: response.usage?.total_tokens || this.estimateTokenCount(text)
      };

    } catch (error: any) {
      console.error('Embeddings API error:', {
        message: error.message,
        status: error.status,
        type: error.type
      });
      
      // Fallback to mock embedding on error
      return this.generateMockEmbedding(text);
    }
  }

  /**
   * Generate embeddings for multiple text chunks
   */
  async generateEmbeddings(texts: string[]): Promise<EmbeddingResult[]> {
    const results: EmbeddingResult[] = [];
    
    // Process in batches to avoid rate limits
    const batchSize = 20;
    for (let i = 0; i < texts.length; i += batchSize) {
      const batch = texts.slice(i, i + batchSize);
      const batchResults = await Promise.all(
        batch.map(text => this.generateEmbedding(text))
      );
      results.push(...batchResults);
      
      // Small delay between batches
      if (i + batchSize < texts.length) {
        await new Promise(resolve => setTimeout(resolve, 100));
      }
    }
    
    return results;
  }

  /**
   * Split long text into smaller chunks suitable for embedding
   */
  chunkText(text: string, metadata: Record<string, any> = {}): KnowledgeContent[] {
    // Clean up the text
    const cleanText = text.replace(/\s+/g, ' ').trim();
    
    if (this.estimateTokenCount(cleanText) <= this.maxTokensPerChunk) {
      return [{
        text: cleanText,
        metadata: { ...metadata, chunkIndex: 0 }
      }];
    }

    const chunks: KnowledgeContent[] = [];
    const sentences = this.splitIntoSentences(cleanText);
    let currentChunk = '';
    let chunkIndex = 0;

    for (const sentence of sentences) {
      const testChunk = currentChunk + (currentChunk ? ' ' : '') + sentence;
      
      if (this.estimateTokenCount(testChunk) > this.maxTokensPerChunk && currentChunk) {
        // Save current chunk and start a new one
        chunks.push({
          text: currentChunk.trim(),
          metadata: { ...metadata, chunkIndex }
        });
        currentChunk = sentence;
        chunkIndex++;
      } else {
        currentChunk = testChunk;
      }
    }

    // Add the last chunk if it exists
    if (currentChunk.trim()) {
      chunks.push({
        text: currentChunk.trim(),
        metadata: { ...metadata, chunkIndex }
      });
    }

    console.log(`Split text into ${chunks.length} chunks`);
    return chunks;
  }

  /**
   * Process FAQ or knowledge base content into embedding-ready chunks
   */
  processKnowledgeContent(content: string, sourceType: 'faq' | 'website' | 'manual' = 'faq'): KnowledgeContent[] {
    console.log(`Processing ${sourceType} content: ${content.length} characters`);

    // Handle FAQ format
    if (sourceType === 'faq') {
      return this.processFAQContent(content);
    }

    // Handle general content
    return this.chunkText(content, { sourceType });
  }

  /**
   * Process FAQ-specific content (Q&A pairs)
   */
  private processFAQContent(content: string): KnowledgeContent[] {
    const chunks: KnowledgeContent[] = [];
    
    // Split by common FAQ patterns
    const qaPairs = content.split(/(?:^|\n)(?=Q:|Question:|FAQ:|\d+\.)/gm)
      .filter(section => section.trim().length > 0);

    qaPairs.forEach((pair, index) => {
      const cleanPair = pair.trim();
      if (cleanPair.length < 10) return; // Skip very short entries

      // Try to separate question and answer
      const lines = cleanPair.split('\n').map(line => line.trim());
      const questionLine = lines[0];
      const answerLines = lines.slice(1).filter(line => line.length > 0);
      
      let text = cleanPair;
      let metadata: Record<string, any> = { 
        sourceType: 'faq', 
        pairIndex: index 
      };

      // If we can identify Q&A structure, extract it
      if (answerLines.length > 0 && questionLine) {
        const question = questionLine.replace(/^(Q:|Question:|FAQ:|\d+\.)\s*/i, '');
        const answer = answerLines.join(' ').replace(/^(A:|Answer:)\s*/i, '');
        
        if (question && answer) {
          text = `Question: ${question}\nAnswer: ${answer}`;
          metadata = { 
            ...metadata, 
            question, 
            answer,
            hasStructure: true 
          };
        }
      }

      chunks.push({ text, metadata });
    });

    console.log(`Processed FAQ into ${chunks.length} Q&A pairs`);
    return chunks;
  }

  /**
   * Estimate token count for text (rough approximation)
   */
  private estimateTokenCount(text: string): number {
    // Rough approximation: 1 token ≈ 4 characters for English text
    return Math.ceil(text.length / 4);
  }

  /**
   * Split text into sentences for better chunking
   */
  private splitIntoSentences(text: string): string[] {
    return text
      .split(/[.!?]+/)
      .map(sentence => sentence.trim())
      .filter(sentence => sentence.length > 0)
      .map(sentence => sentence + '.');
  }

  /**
   * Generate mock embedding for demo/fallback purposes
   */
  private generateMockEmbedding(text: string): EmbeddingResult {
    // Generate a consistent mock embedding based on text hash
    const hash = this.simpleHash(text);
    const embedding = Array.from({ length: 1536 }, (_, i) => {
      return Math.sin(hash + i) * 0.1; // Small values to simulate normalized embeddings
    });

    return {
      embedding,
      tokenCount: this.estimateTokenCount(text)
    };
  }

  /**
   * Simple hash function for consistent mock embeddings
   */
  private simpleHash(text: string): number {
    let hash = 0;
    for (let i = 0; i < text.length; i++) {
      const char = text.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32bit integer
    }
    return hash;
  }
}

export const embeddingsService = new EmbeddingsService();