import { knowledgeService, BusinessKnowledgeBase } from '@/services/knowledge';
import { db } from '@/services/database';

/**
 * Setup sample knowledge bases for 3 business types for demo purposes
 */

// Medical Clinic Knowledge Base
const medicalClinicKB: BusinessKnowledgeBase = {
  businessType: 'medical',
  businessName: 'Sydney Family Medical Centre',
  hours: 'Monday-Friday: 8:00 AM - 6:00 PM, Saturday: 9:00 AM - 2:00 PM, Sunday: Closed',
  services: [
    'General Consultations',
    'Preventive Health Checks',
    'Vaccinations',
    'Minor Procedures',
    'Health Assessments',
    'Chronic Disease Management',
    'Mental Health Care Plans'
  ],
  location: '123 Collins Street, Melbourne, VIC 3000',
  phone: '+61 2 5944 5971',
  faqs: [
    {
      question: 'Do you accept Medicare?',
      answer: 'Yes, we accept Medicare and most private health insurance funds. We offer bulk billing for eligible patients.'
    },
    {
      question: 'How do I book an appointment?',
      answer: 'You can book online through our website, call us at +61 2 5944 5971, or visit our clinic during business hours.'
    },
    {
      question: 'What should I bring to my appointment?',
      answer: 'Please bring your Medicare card, any relevant health fund cards, a list of current medications, and any previous test results.'
    },
    {
      question: 'Do you offer same-day appointments?',
      answer: 'Yes, we keep some same-day appointments available for urgent matters. Call us to check availability.'
    },
    {
      question: 'What are your fees?',
      answer: 'Standard consultation is $85. We bulk bill eligible patients. Longer consultations and procedures may have additional fees.'
    },
    {
      question: 'Do you do home visits?',
      answer: 'We offer home visits for elderly or mobility-impaired patients in special circumstances. Please call to discuss.'
    }
  ],
  policies: [
    'Appointment cancellations require 24 hours notice',
    'We run on time - please arrive 10 minutes early',
    'Children under 16 must be accompanied by a parent or guardian'
  ]
};

// Electrician Knowledge Base
const electricianKB: BusinessKnowledgeBase = {
  businessType: 'electrician',
  businessName: 'Melbourne Electrical Services',
  hours: 'Monday-Friday: 7:00 AM - 5:00 PM, Saturday: 8:00 AM - 2:00 PM, Emergency calls 24/7',
  services: [
    'Residential Electrical Repairs',
    'Commercial Electrical Work',
    'Emergency Electrical Services',
    'Safety Inspections',
    'LED Lighting Installation',
    'Ceiling Fan Installation',
    'Switchboard Upgrades',
    'Power Point Installation'
  ],
  location: 'Serving all Melbourne metropolitan areas',
  phone: '+61 2 5944 5971',
  faqs: [
    {
      question: 'Do you offer emergency services?',
      answer: 'Yes, we provide 24/7 emergency electrical services. Emergency callout fee is $180 plus parts and labor.'
    },
    {
      question: 'What areas do you service?',
      answer: 'We service all Melbourne metropolitan areas within 40km of the CBD. Travel charges may apply for distant locations.'
    },
    {
      question: 'Are you licensed and insured?',
      answer: 'Yes, we are fully licensed electricians with public liability insurance up to $10 million. License number: EC12345.'
    },
    {
      question: 'How much do you charge?',
      answer: 'Standard rate is $120/hour. Minimum 1-hour charge. Emergency rates are $180/hour with higher minimum charges.'
    },
    {
      question: 'Do you provide free quotes?',
      answer: 'Yes, we provide free quotes for jobs over $300. For smaller jobs, we charge a $75 quote fee which is deducted from the final bill.'
    },
    {
      question: 'How quickly can you come out?',
      answer: 'Regular jobs: same day or next day. Emergency calls: within 2 hours. Peak times may have longer wait times.'
    }
  ],
  policies: [
    'All work comes with 12-month warranty',
    'Payment due on completion - cash, card, or bank transfer accepted',
    'Safety inspections include detailed report'
  ]
};

// Beauty Salon Knowledge Base
const beautySalonKB: BusinessKnowledgeBase = {
  businessType: 'beauty',
  businessName: 'Glow Beauty Studio',
  hours: 'Tuesday-Friday: 9:00 AM - 7:00 PM, Saturday: 9:00 AM - 5:00 PM, Sunday-Monday: Closed',
  services: [
    'Facial Treatments',
    'Eyebrow Shaping & Tinting',
    'Eyelash Extensions',
    'Massage Therapy',
    'Nail Services',
    'Waxing Services',
    'Skin Consultations',
    'Bridal Packages'
  ],
  location: '456 Chapel Street, South Yarra, VIC 3141',
  phone: '+61 2 5944 5971',
  faqs: [
    {
      question: 'Do I need to book in advance?',
      answer: 'Yes, we recommend booking at least 1 week in advance. Popular times (evenings and weekends) may need 2-3 weeks notice.'
    },
    {
      question: 'What products do you use?',
      answer: 'We use premium brands including Dermalogica, OPI, and Environ. All products are professional grade and hypoallergenic.'
    },
    {
      question: 'What is your cancellation policy?',
      answer: 'We require 24 hours notice for cancellations. Less than 24 hours notice incurs a 50% charge of the service fee.'
    },
    {
      question: 'Do you offer package deals?',
      answer: 'Yes, we have monthly beauty packages and bridal packages. Ask about our loyalty program for regular clients.'
    },
    {
      question: 'How much do treatments cost?',
      answer: 'Facial: $120-180, Massage: $100-150, Nails: $45-80, Waxing: $25-95. Prices vary by treatment length and complexity.'
    },
    {
      question: 'Do you offer gift vouchers?',
      answer: 'Yes, gift vouchers are available for any amount or specific treatments. Valid for 12 months from purchase date.'
    }
  ],
  policies: [
    'First-time clients receive 10% discount',
    'We use only sterilized equipment',
    'Consultation required for certain treatments'
  ]
};

// Pest Control Knowledge Base - Pest Blitz Demo
const pestControlKB: BusinessKnowledgeBase = {
  businessType: 'pestcontrol',
  businessName: 'Pest Blitz',
  hours: 'Monday-Friday: 7:00 AM - 7:00 PM, Saturday: 8:00 AM - 12:00 PM, Sunday: Closed',
  services: [
    'Residential Pest Control',
    'Commercial Pest Control', 
    'Termite Treatment',
    'Ant Control',
    'Cockroach Treatment',
    'Spider Control',
    'Rodent Control'
  ],
  location: 'North Shore Sydney - Mosman, Cremorne, Kirribilli, North Sydney, Chatswood, Neutral Bay',
  phone: '02 8330 6682',
  faqs: [
    {
      question: 'What areas do you service?',
      answer: 'We service North Shore Sydney including Mosman, Cremorne, Kirribilli, North Sydney, Chatswood, and Neutral Bay.'
    },
    {
      question: 'Are your treatments safe for families and pets?',
      answer: 'Yes, we use low-toxicity, quick-drying, odorless chemicals that are safe for families and pets.'
    },
    {
      question: 'How long does a treatment take?',
      answer: 'Most residential treatments take 20-30 minutes. You can be home during the service.'
    },
    {
      question: 'Do you provide guarantees on your work?',
      answer: 'Yes, we provide guarantees on our pest control services and conduct risk assessments before treatments.'
    },
    {
      question: 'How quickly can you come out for service?',
      answer: 'We offer same-day and next-day service. For urgent termite or commercial issues, we prioritize emergency bookings.'
    }
  ],
  policies: [
    'We use green, family-friendly products with lowest mammalian toxicity',
    'Non-repellent treatments for indoor applications',
    'Risk assessments conducted before all treatments',
    'Tailored treatment plans based on pest type and infestation level',
    'Documentation provided for commercial clients to meet health regulations',
    'Flexible scheduling to minimize disruption to business operations'
  ]
};

async function setupKnowledgeBases() {
  try {
    console.log('🔧 Setting up sample knowledge bases...');

    // Check database connection
    const isHealthy = await db.healthCheck();
    if (!isHealthy) {
      throw new Error('Database connection failed');
    }

    // Demo tenant ID (from init.sql)
    const demoTenantId = '550e8400-e29b-41d4-a716-446655440000';

    console.log('\n📋 Setting up Medical Clinic knowledge base...');
    await knowledgeService.setupBusinessKnowledgeBase(demoTenantId, medicalClinicKB);
    
    console.log('\n⚡ Setting up Electrician knowledge base...');
    // For demo, we'll create additional tenant records for different business types
    // In production, each business would have their own tenant ID
    await knowledgeService.setupBusinessKnowledgeBase(demoTenantId, electricianKB);
    
    console.log('\n💄 Setting up Beauty Salon knowledge base...');
    await knowledgeService.setupBusinessKnowledgeBase(demoTenantId, beautySalonKB);
    
    console.log('\n🐛 Setting up Pest Control knowledge base (Pest Blitz Demo)...');
    await knowledgeService.setupBusinessKnowledgeBase(demoTenantId, pestControlKB);

    // Get knowledge statistics
    const stats = await knowledgeService.getKnowledgeStats(demoTenantId);
    console.log('\n📊 Knowledge Base Statistics:');
    console.log(`Total chunks: ${stats.totalChunks}`);
    console.log(`Total tokens: ${stats.totalTokens}`);
    console.log('Categories:', stats.categories);

    // Test search functionality
    console.log('\n🔍 Testing knowledge search...');
    const testQueries = [
      'What are your opening hours?',
      'Do you accept Medicare?',
      'How much do you charge?',
      'What services do you offer?'
    ];

    for (const query of testQueries) {
      console.log(`\nQuery: "${query}"`);
      const results = await knowledgeService.searchKnowledge(demoTenantId, query, 2);
      results.forEach((result, index) => {
        console.log(`  ${index + 1}. (${result.similarity.toFixed(2)}) ${result.content.substring(0, 100)}...`);
      });
    }

    console.log('\n✅ Knowledge bases setup complete!');

  } catch (error) {
    console.error('❌ Error setting up knowledge bases:', error);
    process.exit(1);
  } finally {
    await db.close();
  }
}

// Run if this script is executed directly
if (require.main === module) {
  setupKnowledgeBases();
}

export { setupKnowledgeBases, medicalClinicKB, electricianKB, beautySalonKB, pestControlKB };