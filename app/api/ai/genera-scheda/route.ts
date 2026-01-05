import { NextResponse } from "next/server";
import OpenAI from "openai";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type WorkoutPlanJSON = {
  title: string;
  notes?: string;
  days: Array<{
    label: string;
    exercises: Array<{ name: string; sets?: number; reps?: string; rest?: string }>;
  }>;
};

type NutritionPlanJSON = {
  title: string;
  notes?: string;
  meals: Array<{
    label: string;
    items: Array<{
      item: string;
      calories?: number;
      protein_g?: number;
      carbs_g?: number;
      fats_g?: number;
    }>;
  }>;
};

type OutputJSON = {
  ok: true;
  source: "openai" | "fallback";
  workout: WorkoutPlanJSON;
  nutrition: NutritionPlanJSON;
};

function fallback(goal?: string, level?: string): OutputJSON {
  const g = (goal || "Full Body").trim();
  const lvl = (level || "base").toLowerCase();
  const rounds = lvl === "advanced" ? 4 : lvl === "intermediate" ? 3 : 2;
  return {
    ok: true,
    source: "fallback",
    workout: {
      title: `Circuito ${g} (${lvl})`,
      notes: `Esegui ${rounds} giri. Recupero breve, tecnica pulita.`,
      days: [
        {
          label: "Circuito",
          exercises: [
            { name: "Squat", sets: rounds, reps: "12-15", rest: "20s" },
            { name: "Push-up", sets: rounds, reps: "10-12", rest: "20s" },
            { name: "Rematore elastico", sets: rounds, reps: "12-15", rest: "20s" },
            { name: "Plank", sets: rounds, reps: "30-45s", rest: "30s" },
          ],
        },
      ],
    },
    nutrition: {
      title: `Piano ${g} (${lvl})`,
      notes: "Esempio base. Personalizza su kcal e preferenze.",
      meals: [
        {
          label: "Colazione",
          items: [
            { item: "Yogurt greco + frutta + miele", calories: 380, protein_g: 25, carbs_g: 40, fats_g: 10 },
          ],
        },
        {
          label: "Pranzo",
          items: [
            { item: "Riso + pollo + verdure", calories: 650, protein_g: 45, carbs_g: 75, fats_g: 15 },
          ],
        },
        {
          label: "Cena",
          items: [
            { item: "Pesce + patate + insalata", calories: 600, protein_g: 40, carbs_g: 60, fats_g: 18 },
          ],
        },
      ],
    },
  };
}

function safeExtractJson(text: string): any | null {
  // prova: JSON puro
  try {
    return JSON.parse(text);
  } catch {}
  // prova: trova primo blocco {...}
  const match = text.match(/\{[\s\S]*\}/);
  if (!match) return null;
  try {
    return JSON.parse(match[0]);
  } catch {
    return null;
  }
}

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({} as any));
  const goal = body?.goal ?? body?.obiettivo ?? body?.target;
  const level = body?.level ?? body?.livello;

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return NextResponse.json(fallback(goal, level));
  }

  try {
    const client = new OpenAI({ apiKey });

    const prompt = `Sei un personal trainer.
Genera 1 scheda ALLENAMENTO + 1 piano ALIMENTAZIONE.

Vincoli:
- Output: JSON puro (senza markdown, senza testo extra).
- workout.days: array di giorni con label e lista esercizi.
- Ogni esercizio: name, sets (numero), reps (stringa), rest (stringa).
- nutrition.meals: array di pasti con label e items.
- Ogni item: item, calories, protein_g, carbs_g, fats_g (numeri, opzionali).

Obiettivo: ${String(goal || "Full Body")}
Livello: ${String(level || "base")}

JSON schema:
{ "workout": {"title":"...","notes":"...","days":[{"label":"A","exercises":[{"name":"...","sets":3,"reps":"8-12","rest":"60s"}]}]},
  "nutrition": {"title":"...","notes":"...","meals":[{"label":"Colazione","items":[{"item":"...","calories":400,"protein_g":30,"carbs_g":40,"fats_g":10}]}]} }`;

    // usa Responses API se disponibile nella versione del package
    const resp: any = await (client as any).responses.create({
      model: process.env.OPENAI_MODEL || "gpt-4o-mini",
      input: prompt,
    });

    const text: string = resp?.output_text || resp?.output?.[0]?.content?.[0]?.text || "";
    const parsed = safeExtractJson(text);
    if (!parsed?.workout || !parsed?.nutrition) {
      return NextResponse.json(fallback(goal, level));
    }
    const out: OutputJSON = {
      ok: true,
      source: "openai",
      workout: parsed.workout,
      nutrition: parsed.nutrition,
    };
    return NextResponse.json(out);
  } catch (e) {
    return NextResponse.json(fallback(goal, level));
  }
}
