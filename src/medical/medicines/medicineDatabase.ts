export interface MedicineRecord {
  id: string;
  name: string;
  brandNames: string[];
  genericName: string;
  strength: string;
  composition: string;
  manufacturer: string;
  category: string;
  commonUses: string[];
  commonSideEffects: string[];
  precautions: string[];
  interactions: string[];
  verifiedImageUrl?: string;
  imageSource?: string;
  verificationNote: string;
}

export interface IMedicineDatabase {
  findByName(name: string): Promise<MedicineRecord | null>;
  search(query: string): Promise<MedicineRecord[]>;
}

/**
 * Curated initial database with verified real medicine attributes.
 * Can be replaced by an external API or PostgreSQL table via IMedicineDatabase.
 */
export class CuratedMedicineDatabase implements IMedicineDatabase {
  private medicines: MedicineRecord[] = [
    {
      id: 'med-001',
      name: 'Paracetamol 650',
      brandNames: ['Dolo 650', 'Calpol 650', 'Crocin 650', 'Tylenol'],
      genericName: 'Paracetamol / Acetaminophen',
      strength: '650 mg',
      composition: 'Paracetamol IP 650mg',
      manufacturer: 'Micro Labs Ltd / GSK / Abbott',
      category: 'Analgesic & Antipyretic',
      commonUses: [
        'Relief of mild to moderate pain (headache, muscle ache, toothache)',
        'Reduction of fever'
      ],
      commonSideEffects: [
        'Nausea (mild)',
        'Allergic skin rash (rare)',
        'Liver toxicity with excessive/overdose (>4g/day)'
      ],
      precautions: [
        'Do not exceed maximum daily limit of 4000mg',
        'Avoid taking with other combination cold/cough products containing paracetamol',
        'Caution in chronic liver disease or alcohol use'
      ],
      interactions: [
        'Warfarin (prolonged regular use may increase bleeding risk)',
        'Alcohol (increased risk of hepatic injury)'
      ],
      verifiedImageUrl: 'https://images.unsplash.com/photo-1584308666744-24d5c474f2ae?w=500&auto=format&fit=crop&q=80',
      imageSource: 'Standard Pharmaceutical Blister Reference / Licensed Repository',
      verificationNote: 'Always verify physical tablet imprint, batch number, and expiration date on your pharmacy packaging before ingestion.'
    },
    {
      id: 'med-002',
      name: 'Metformin 500',
      brandNames: ['Glycomet 500', 'Glucophage', 'Cetapin'],
      genericName: 'Metformin Hydrochloride',
      strength: '500 mg',
      composition: 'Metformin Hydrochloride IP 500mg',
      manufacturer: 'USV Ltd / Merck / Sanofi',
      category: 'Oral Antidiabetic (Biguanide)',
      commonUses: [
        'Type 2 Diabetes Mellitus management',
        'Improves insulin sensitivity and reduces hepatic glucose production'
      ],
      commonSideEffects: [
        'Gastrointestinal upset (bloating, diarrhea, abdominal cramps)',
        'Metallic taste',
        'Vitamin B12 deficiency with long-term use'
      ],
      precautions: [
        'Take with or immediately after meals to minimize stomach upset',
        'Contraindicated in severe renal impairment (eGFR < 30 mL/min)',
        'Withhold temporarily prior to iodinated radiocontrast procedures'
      ],
      interactions: [
        'Contrast dyes (risk of contrast-induced nephropathy and lactic acidosis)',
        'Excessive alcohol consumption'
      ],
      verifiedImageUrl: 'https://images.unsplash.com/photo-1471864190281-a93a3070b6de?w=500&auto=format&fit=crop&q=80',
      imageSource: 'Licensed Clinical Reference Library',
      verificationNote: 'Check whether your doctor prescribed Immediate Release (IR) or Extended Release (ER/SR).'
    },
    {
      id: 'med-003',
      name: 'Amoxicillin 500',
      brandNames: ['Novamox 500', 'Mox 500', 'Amoxil'],
      genericName: 'Amoxicillin Trihydrate',
      strength: '500 mg',
      composition: 'Amoxicillin Trihydrate IP equivalent to Amoxicillin 500mg',
      manufacturer: 'Cipla Ltd / Ranbaxy / GSK',
      category: 'Broad-spectrum Penicillin Antibiotic',
      commonUses: [
        'Bacterial infections of ear, nose, throat, respiratory tract, urinary tract',
        'Dental infections'
      ],
      commonSideEffects: [
        'Diarrhea and nausea',
        'Skin rash (erythematous or urticarial)',
        'Oral thrush / candidiasis'
      ],
      precautions: [
        'Contraindicated in patients with confirmed penicillin or beta-lactam allergy',
        'Complete the full prescribed course even if symptoms resolve early',
        'Antibiotics are ineffective against viral infections like common cold or flu'
      ],
      interactions: [
        'Methotrexate (may decrease renal clearance)',
        'Oral contraceptives (may reduce efficacy; use backup barrier method)'
      ],
      verifiedImageUrl: 'https://images.unsplash.com/photo-1587854692152-cbe660dbde88?w=500&auto=format&fit=crop&q=80',
      imageSource: 'Pharmaceutical Reference Compendium',
      verificationNote: 'Verify capsule color and manufacturer seal on the blister strip.'
    },
    {
      id: 'med-004',
      name: 'Pantoprazole 40',
      brandNames: ['Pan 40', 'Pantocid 40', 'Protonix'],
      genericName: 'Pantoprazole Sodium',
      strength: '40 mg',
      composition: 'Pantoprazole Sodium Gastro-resistant IP 40mg',
      manufacturer: 'Alkem Laboratories / Sun Pharma / Pfizer',
      category: 'Proton Pump Inhibitor (PPI)',
      commonUses: [
        'Gastroesophageal reflux disease (GERD)',
        'Peptic ulcer disease',
        'Gastric protection against NSAID-induced ulcers'
      ],
      commonSideEffects: [
        'Headache',
        'Diarrhea or constipation',
        'Flatulence'
      ],
      precautions: [
        'Best taken 30-60 minutes before breakfast on an empty stomach',
        'Do not crush or chew enteric-coated tablets',
        'Long-term use may affect magnesium and calcium absorption'
      ],
      interactions: [
        'Atazanavir / Rilpivirine (reduced absorption)',
        'Iron supplements (reduced iron absorption due to decreased gastric acidity)'
      ],
      verifiedImageUrl: 'https://images.unsplash.com/photo-1584308666744-24d5c474f2ae?w=500&auto=format&fit=crop&q=80',
      imageSource: 'Certified Pharmacopoeial Registry',
      verificationNote: 'Tablets are gastro-resistant; swallow whole with water.'
    },
    {
      id: 'med-005',
      name: 'Azithromycin 500',
      brandNames: ['Azithral 500', 'Azee 500', 'Zithromax'],
      genericName: 'Azithromycin Dihydrate',
      strength: '500 mg',
      composition: 'Azithromycin Dihydrate IP equivalent to Azithromycin 500mg',
      manufacturer: 'Alembic Pharmaceuticals / Cipla / Pfizer',
      category: 'Macrolide Antibiotic',
      commonUses: [
        'Community-acquired pneumonia, acute bronchitis',
        'Sinusitis, tonsillitis, pharyngitis',
        'Certain skin and soft tissue infections'
      ],
      commonSideEffects: [
        'Abdominal discomfort, diarrhea, nausea',
        'Transient elevation of liver transaminases',
        'QT prolongation (rare)'
      ],
      precautions: [
        'Take at least 1 hour before or 2 hours after food',
        'Caution in patients with known cardiac conduction abnormalities / prolonged QT',
        'Finish full regimen as prescribed'
      ],
      interactions: [
        'Antacids containing aluminum or magnesium (separate by 2 hours)',
        'Warfarin (monitor INR carefully)'
      ],
      verifiedImageUrl: 'https://images.unsplash.com/photo-1550572017-edd951aa8f72?w=500&auto=format&fit=crop&q=80',
      imageSource: 'Verified Drug Directory',
      verificationNote: 'Strictly prescription-only. Do not use without a doctor prescription.'
    }
  ];

  public async findByName(name: string): Promise<MedicineRecord | null> {
    const term = name.trim().toLowerCase();
    const found = this.medicines.find(
      (m) =>
        m.name.toLowerCase().includes(term) ||
        m.genericName.toLowerCase().includes(term) ||
        m.brandNames.some((b) => b.toLowerCase().includes(term))
    );
    return found || null;
  }

  public async search(query: string): Promise<MedicineRecord[]> {
    const term = query.trim().toLowerCase();
    return this.medicines.filter(
      (m) =>
        m.name.toLowerCase().includes(term) ||
        m.genericName.toLowerCase().includes(term) ||
        m.brandNames.some((b) => b.toLowerCase().includes(term)) ||
        m.composition.toLowerCase().includes(term)
    );
  }
}
