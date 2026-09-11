import "../src/config";
import { Database } from "../src/database";

const sampleQuestions = [
  // --- SD: Matematika ---
  {
    grade_level: "SD",
    subject: "Matematika",
    question_text: "Hasil dari 125 + 375 - 150 adalah...",
    options: [
      { id: "A", text: "300" },
      { id: "B", text: "350" },
      { id: "C", text: "400" },
      { id: "D", text: "450" },
    ],
    correct_option_id: "B",
    explanation: "125 + 375 = 500, kemudian 500 - 150 = 350.",
  },
  {
    grade_level: "SD",
    subject: "Matematika",
    question_text:
      "Sebuah persegi memiliki panjang sisi 12 cm. Berapakah luas persegi tersebut?",
    options: [
      { id: "A", text: "48 cm²" },
      { id: "B", text: "120 cm²" },
      { id: "C", text: "144 cm²" },
      { id: "D", text: "288 cm²" },
    ],
    correct_option_id: "C",
    explanation: "Luas persegi = sisi × sisi = 12 cm × 12 cm = 144 cm².",
  },
  {
    grade_level: "SD",
    subject: "Matematika",
    question_text: "Pecahan senilai dari 3/4 adalah...",
    options: [
      { id: "A", text: "6/8" },
      { id: "B", text: "5/8" },
      { id: "C", text: "9/16" },
      { id: "D", text: "3/8" },
    ],
    correct_option_id: "A",
    explanation:
      "Jika pembilang dan penyebut 3/4 dikali 2, hasilnya adalah 6/8.",
  },
  {
    grade_level: "SD",
    subject: "Matematika",
    question_text: "KPK dari bilangan 12 dan 18 adalah...",
    options: [
      { id: "A", text: "6" },
      { id: "B", text: "24" },
      { id: "C", text: "36" },
      { id: "D", text: "72" },
    ],
    correct_option_id: "C",
    explanation:
      "Kelipatan 12: 12, 24, 36... dan kelipatan 18: 18, 36... KPK terkecil yang sama adalah 36.",
  },
  {
    grade_level: "SD",
    subject: "Matematika",
    question_text:
      "Budi memiliki 5 kotak kelereng. Setiap kotak berisi 24 kelereng. Jumlah seluruh kelereng Budi adalah...",
    options: [
      { id: "A", text: "100" },
      { id: "B", text: "110" },
      { id: "C", text: "120" },
      { id: "D", text: "130" },
    ],
    correct_option_id: "C",
    explanation: "Total kelereng = 5 × 24 = 120 kelereng.",
  },

  // --- SD: IPA ---
  {
    grade_level: "SD",
    subject: "IPA",
    question_text:
      "Tumbuhan hijau membuat makanannya sendiri melalui proses...",
    options: [
      { id: "A", text: "Respirasi" },
      { id: "B", text: "Fotosintesis" },
      { id: "C", text: "Transpirasi" },
      { id: "D", text: "Adaptasi" },
    ],
    correct_option_id: "B",
    explanation:
      "Fotosintesis adalah proses tumbuhan hijau membuat makanan dengan bantuan sinar matahari dan klorofil.",
  },
  {
    grade_level: "SD",
    subject: "IPA",
    question_text: "Hewan yang mengalami metamorfosis sempurna adalah...",
    options: [
      { id: "A", text: "Kupu-kupu" },
      { id: "B", text: "Belalang" },
      { id: "C", text: "Kecoa" },
      { id: "D", text: "Capung" },
    ],
    correct_option_id: "A",
    explanation:
      "Kupu-kupu mengalami metamorfosis sempurna (Telur -> Ulat -> Kepompong -> Kupu-kupu).",
  },
  {
    grade_level: "SD",
    subject: "IPA",
    question_text:
      "Benda yang dapat ditarik kuat oleh magnet dinamakan benda...",
    options: [
      { id: "A", text: "Paramagnetik" },
      { id: "B", text: "Feromagnetik" },
      { id: "C", text: "Diamagnetik" },
      { id: "D", text: "Non-magnetik" },
    ],
    correct_option_id: "B",
    explanation:
      "Feromagnetik adalah benda yang ditarik kuat oleh magnet seperti besi dan baja.",
  },

  // --- SMP: Matematika ---
  {
    grade_level: "SMP",
    subject: "Matematika",
    question_text: "Jika 3x + 7 = 22, maka nilai x adalah...",
    options: [
      { id: "A", text: "3" },
      { id: "B", text: "4" },
      { id: "C", text: "5" },
      { id: "D", text: "6" },
    ],
    correct_option_id: "C",
    explanation: "3x = 22 - 7 => 3x = 15 => x = 5.",
  },
  {
    grade_level: "SMP",
    subject: "Matematika",
    question_text: "Hasil dari (2a + 3b)(a - b) adalah...",
    options: [
      { id: "A", text: "2a² + ab - 3b²" },
      { id: "B", text: "2a² - ab - 3b²" },
      { id: "C", text: "2a² + 5ab - 3b²" },
      { id: "D", text: "2a² - 5ab - 3b²" },
    ],
    correct_option_id: "A",
    explanation:
      "(2a)(a) + (2a)(-b) + (3b)(a) + (3b)(-b) = 2a² - 2ab + 3ab - 3b² = 2a² + ab - 3b².",
  },
  {
    grade_level: "SMP",
    subject: "Matematika",
    question_text:
      "Sebuah segitiga siku-siku memiliki panjang alas 6 cm dan tinggi 8 cm. Panjang sisi miring segitiga tersebut adalah...",
    options: [
      { id: "A", text: "9 cm" },
      { id: "B", text: "10 cm" },
      { id: "C", text: "12 cm" },
      { id: "D", text: "14 cm" },
    ],
    correct_option_id: "B",
    explanation: "Sisi miring c = √(6² + 8²) = √(36 + 64) = √100 = 10 cm.",
  },
  {
    grade_level: "SMP",
    subject: "Matematika",
    question_text: "Rata-rata dari data 7, 8, 6, 9, 10, 8 adalah...",
    options: [
      { id: "A", text: "7,5" },
      { id: "B", text: "8,0" },
      { id: "C", text: "8,2" },
      { id: "D", text: "8,5" },
    ],
    correct_option_id: "B",
    explanation: "Jumlah data = 7+8+6+9+10+8 = 48. Rata-rata = 48 / 6 = 8,0.",
  },
  {
    grade_level: "SMP",
    subject: "Matematika",
    question_text:
      "Gradien garis yang melalui titik (2, 3) dan (4, 11) adalah...",
    options: [
      { id: "A", text: "2" },
      { id: "B", text: "3" },
      { id: "C", text: "4" },
      { id: "D", text: "5" },
    ],
    correct_option_id: "C",
    explanation: "m = (y2 - y1) / (x2 - x1) = (11 - 3) / (4 - 2) = 8 / 2 = 4.",
  },

  // --- SMP: Bahasa Indonesia ---
  {
    grade_level: "SMP",
    subject: "Bahasa Indonesia",
    question_text: "Ide pokok dari sebuah paragraf biasanya terdapat pada...",
    options: [
      { id: "A", text: "Kalimat penjelas" },
      { id: "B", text: "Kalimat utama" },
      { id: "C", text: "Kata kunci saja" },
      { id: "D", text: "Judul teks" },
    ],
    correct_option_id: "B",
    explanation:
      "Ide pokok berada pada kalimat utama, yang terletak di awal, akhir, atau campuran.",
  },
  {
    grade_level: "SMP",
    subject: "Bahasa Indonesia",
    question_text:
      "Teks yang berisi gambaran objek secara jelas dan terperinci sehingga pembaca seolah-olah merasakan sendiri disebut teks...",
    options: [
      { id: "A", text: "Exposisi" },
      { id: "B", text: "Deskripsi" },
      { id: "C", text: "Narasi" },
      { id: "D", text: "Persuasi" },
    ],
    correct_option_id: "B",
    explanation:
      "Teks deskripsi bertujuan menggambarkan objek secara rinci hingga melibat kesan indra pembaca.",
  },

  // --- SMA: Bahasa Inggris ---
  {
    grade_level: "SMA",
    subject: "Bahasa Inggris",
    question_text: "Choose the correct sentence in Simple Present Tense:",
    options: [
      { id: "A", text: "She go to school every day." },
      { id: "B", text: "She goes to school every day." },
      { id: "C", text: "She is go to school every day." },
      { id: "D", text: "She went to school every day." },
    ],
    correct_option_id: "B",
    explanation:
      "Third person singular (she) in Simple Present adds '-es' to the verb 'go' -> 'goes'.",
  },
  {
    grade_level: "SMA",
    subject: "Bahasa Inggris",
    question_text: "If I _____ enough money, I would buy that new laptop.",
    options: [
      { id: "A", text: "have" },
      { id: "B", text: "had" },
      { id: "C", text: "will have" },
      { id: "D", text: "have had" },
    ],
    correct_option_id: "B",
    explanation:
      "Conditional Type 2: If + Past Simple (had), Subject + would + Infinitive (would buy).",
  },
  {
    grade_level: "SMA",
    subject: "Bahasa Inggris",
    question_text: "The report _____ by the team before the meeting started.",
    options: [
      { id: "A", text: "was finished" },
      { id: "B", text: "had been finished" },
      { id: "C", text: "is finishing" },
      { id: "D", text: "will finish" },
    ],
    correct_option_id: "B",
    explanation:
      "Past Perfect Passive is used for an action completed before another past event.",
  },

  // --- UTBK: TPS/TPA ---
  {
    grade_level: "UTBK",
    subject: "TPS/TPA",
    question_text:
      "Semua siswa lulus ujian. Sebagian siswa yang lulus ujian mendaftar ke perguruan tinggi. Kesimpulan yang tepat adalah...",
    options: [
      { id: "A", text: "Semua siswa mendaftar ke perguruan tinggi." },
      { id: "B", text: "Sebagian siswa tidak mendaftar ke perguruan tinggi." },
      { id: "C", text: "Tidak ada siswa yang tidak mendaftar." },
      { id: "D", text: "Semua yang tidak lulus mendaftar perguruan tinggi." },
      { id: "E", text: "Tidak dapat ditarik kesimpulan." },
    ],
    correct_option_id: "B",
    explanation:
      "Jika sebagian siswa mendaftar, maka sebagian siswa lainnya (yang lulus ujian) tidak mendaftar.",
  },
  {
    grade_level: "UTBK",
    subject: "TPS/TPA",
    question_text:
      "Deret angka: 2, 4, 8, 16, 32, ... Angka berikutnya adalah...",
    options: [
      { id: "A", text: "48" },
      { id: "B", text: "56" },
      { id: "C", text: "64" },
      { id: "D", text: "72" },
      { id: "E", text: "128" },
    ],
    correct_option_id: "C",
    explanation:
      "Pola deret adalah dikali 2 (geometri dengan rasio 2). 32 × 2 = 64.",
  },
  {
    grade_level: "UTBK",
    subject: "TPS/TPA",
    question_text: "Kuda : Rumput = Manusia : ...",
    options: [
      { id: "A", text: "Air" },
      { id: "B", text: "Nasi" },
      { id: "C", text: "Piring" },
      { id: "D", text: "Sawah" },
      { id: "E", text: "Kebutuhan" },
    ],
    correct_option_id: "B",
    explanation:
      "Hubungan analogi: Kuda makan rumput, Manusia makan nasi (makanan pokok).",
  },
  {
    grade_level: "UTBK",
    subject: "TPS/TPA",
    question_text:
      "Jika P = 2a + 3b dan Q = 3a + 2b, di mana a > b > 0, maka...",
    options: [
      { id: "A", text: "P > Q" },
      { id: "B", text: "P < Q" },
      { id: "C", text: "P = Q" },
      { id: "D", text: "P = 2Q" },
      { id: "E", text: "Hubungan P dan Q tidak dapat ditentukan" },
    ],
    correct_option_id: "B",
    explanation:
      "Q - P = (3a + 2b) - (2a + 3b) = a - b. Karena a > b, maka a - b > 0, sehingga Q > P (P < Q).",
  },
  {
    grade_level: "UTBK",
    subject: "TPS/TPA",
    question_text:
      "Dalam suatu kelas terdiri dari 40 siswa. 25 siswa menyukai matematika, 20 siswa menyukai IPA, dan 10 siswa menyukai keduanya. Berapakah jumlah siswa yang tidak menyukai keduanya?",
    options: [
      { id: "A", text: "5" },
      { id: "B", text: "8" },
      { id: "C", text: "10" },
      { id: "D", text: "12" },
      { id: "E", text: "15" },
    ],
    correct_option_id: "A",
    explanation:
      "Total suka setidaknya satu = (25 + 20) - 10 = 35. Yang tidak menyukai keduanya = 40 - 35 = 5.",
  },
];

export async function seedCbt(db: Database) {
  console.log("Seeding CBT Question Bank...");
  for (const q of sampleQuestions) {
    const existing = await db.query(
      "SELECT id FROM cbt_questions WHERE grade_level=$1 AND subject=$2 AND question_text=$3",
      [q.grade_level, q.subject, q.question_text],
    );
    if (!existing.rowCount) {
      await db.query(
        `INSERT INTO cbt_questions (grade_level, subject, question_text, options, correct_option_id, explanation)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [
          q.grade_level,
          q.subject,
          q.question_text,
          JSON.stringify(q.options),
          q.correct_option_id,
          q.explanation,
        ],
      );
    }
  }
  console.log(`Seeded ${sampleQuestions.length} sample CBT questions.`);
}

if (require.main === module) {
  const db = new Database();
  seedCbt(db)
    .then(() => console.log("CBT seed completed."))
    .catch((err) => console.error(err))
    .finally(() => db.onModuleDestroy());
}
