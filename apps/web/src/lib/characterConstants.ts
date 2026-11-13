export const CHARACTER_ROLES = [
  { value: "Protagonista", label: "Protagonista", description: "Personagem central da história." },
  { value: "Coprotagonista", label: "Coprotagonista", description: "Divide o protagonismo com outro personagem ou grupo." },
  { value: "Deuteragonista", label: "Deuteragonista", description: "Segundo personagem mais importante da história." },
  { value: "Tritagonista", label: "Tritagonista", description: "Terceiro personagem mais importante da história." },
  { value: "Antagonista", label: "Antagonista", description: "Principal força de oposição ao protagonista." },
  { value: "Coadjuvante", label: "Coadjuvante", description: "Personagem de apoio com participação relevante na trama." },
  { value: "Secundário", label: "Secundário", description: "Personagem secundário com participação na trama." },
  { value: "Recorrente", label: "Recorrente", description: "Personagem recorrente que surge em múltiplos episódios ou arcos." },
  { value: "Participação Especial", label: "Participação Especial", description: "Personagem que aparece pontualmente, geralmente em uma participação limitada." },
  { value: "Convidado", label: "Convidado", description: "Personagem convidado com aparição específica na história." },
  { value: "Narrador", label: "Narrador", description: "Voz condutora da narrativa ou narrador da história." },
  { value: "Figurante", label: "Figurante", description: "Personagem sem importância narrativa significativa." },
  { value: "Ponta / Extra", label: "Ponta / Extra", description: "Aparição breve ou elenco de apoio pontual." },
] as const;

export type CharacterRole = typeof CHARACTER_ROLES[number]["value"];

export const ARCHETYPE_CATEGORIES = [
  {
    name: "Heróis e protagonistas",
    options: [
      "Herói",
      "Anti-herói",
      "Herói relutante",
      "Herói trágico",
      "Herói idealista",
      "Escolhido",
      "Sobrevivente",
      "Mártir",
      "Redentor",
    ],
  },
  {
    name: "Vilões e antagonistas",
    options: [
      "Vilão clássico",
      "Vilão misterioso",
      "Vilão calculista",
      "Vilão carismático",
      "Vilão megalomaníaco",
      "Vilão trágico",
      "Anti-vilão",
      "Manipulador",
      "Tirano",
      "Corruptor",
    ],
  },
  {
    name: "Aliados e personagens de apoio",
    options: [
      "Aliado leal",
      "Mentor sábio",
      "Protetor",
      "Guardião",
      "Conselheiro",
      "Companheiro",
      "Melhor amigo",
      "Interesse amoroso",
      "Figura parental",
      "Discípulo",
    ],
  },
  {
    name: "Personalidades e comportamentos",
    options: [
      "Alívio cômico",
      "Rebelde",
      "Sarcástico",
      "Cínico",
      "Ingênuo",
      "Inocente",
      "Inteligente",
      "Estratégico",
      "Misterioso",
      "Temperamental",
      "Ambicioso",
      "Arrogante",
      "Carismático",
      "Excêntrico",
      "Covarde",
      "Determinado",
    ],
  },
  {
    name: "Arquétipos narrativos",
    options: [
      "Rival determinado",
      "Anti-herói sombrio",
      "Trapaceiro (Trickster)",
      "Sábio",
      "Explorador",
      "Criador",
      "Governante",
      "Cuidador",
      "Inocente",
      "Pessoa comum",
      "Forasteiro",
      "Rebelde",
      "Bobo da corte",
      "Guardião do conhecimento",
      "Sacrifício heroico",
      "Antagonista circunstancial",
    ],
  },
] as const;

export function parseArchetypes(archetypeStr?: string | null): string[] {
  if (!archetypeStr) return [];
  return archetypeStr
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}
