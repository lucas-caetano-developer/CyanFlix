import React, { useState } from 'react';

interface FaqItem {
  id: string;
  question: string;
  answer: string;
}

const FAQ_ITEMS: FaqItem[] = [
  {
    id: 'faq-1',
    question: 'O que é o CyanFlix?',
    answer: 'O CyanFlix é uma plataforma privada de streaming sob demanda que reúne filmes, séries e animes em uma experiência unificada e moderna. Oferece reprodução em alta definição, múltiplos perfis e interface otimizada tanto para telas touch quanto para Smart TVs e controles remotos.',
  },
  {
    id: 'faq-2',
    question: 'Como faço para obter uma conta de acesso?',
    answer: 'O CyanFlix é um serviço privado. O cadastro público de novos clientes não está disponível — apenas os administradores do sistema podem criar e liberar contas de acesso. Se você já recebeu seu usuário e senha autorizados, basta clicar no botão "Entrar" no topo da página.',
  },
  {
    id: 'faq-3',
    question: 'Uma mesma conta suporta vários perfis diferentes?',
    answer: 'Sim! Uma única conta de acesso suporta múltiplos perfis. Cada membro da casa ou família pode ter seu próprio perfil com nome, avatar personalizado, histórico de episódios assistidos, progresso individual de reprodução e lista de favoritos independente.',
  },
  {
    id: 'faq-4',
    question: 'O CyanFlix possui planos pagos ou mensalidades?',
    answer: 'Não. O CyanFlix é uma biblioteca privada e fechada para usuários convidados. Não existem planos pagos, assinaturas com cobrança ou taxas periódicas.',
  },
  {
    id: 'faq-5',
    question: 'Em quais dispositivos posso assistir ao CyanFlix?',
    answer: 'Você pode assistir em qualquer navegador moderno (Chrome, Firefox, Safari, Edge) em computadores, Smart TVs, TV Boxes (com suporte a navegação por setas do controle remoto), tablets e smartphones com instalação via PWA (Progressive Web App).',
  },
  {
    id: 'faq-6',
    question: 'Os conteúdos contam com opções de dublagem e legendas?',
    answer: 'Sim! Os títulos contam com faixas de áudio original, dublagens em português e legendas sincronizadas selecionáveis diretamente pelo painel de controle do player durante a reprodução.',
  },
];

export function FaqSection() {
  const [openIds, setOpenIds] = useState<Set<string>>(new Set(['faq-1', 'faq-2']));

  const toggle = (id: string) => {
    setOpenIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  return (
    <section className="welcome-faq" id="faq" aria-label="Perguntas frequentes">
      <div className="welcome-faq__inner">
        <h2 className="welcome-section-heading">Perguntas frequentes</h2>
        <p className="welcome-section-subheading">
          Tire suas dúvidas sobre o funcionamento do CyanFlix e a gestão de contas e perfis.
        </p>

        <div className="welcome-faq__list" role="region" aria-label="Acordeão de perguntas frequentes">
          {FAQ_ITEMS.map((item) => {
            const isOpen = openIds.has(item.id);
            const questionId = `faq-q-${item.id}`;
            const answerId = `faq-a-${item.id}`;

            return (
              <div key={item.id} className={`welcome-faq__item ${isOpen ? 'welcome-faq__item--open' : ''}`}>
                <button
                  type="button"
                  id={questionId}
                  aria-expanded={isOpen}
                  aria-controls={answerId}
                  className="welcome-faq__question"
                  onClick={() => toggle(item.id)}
                >
                  <span>{item.question}</span>
                  <span className="welcome-faq__icon" aria-hidden="true">
                    {isOpen ? '✕' : '+'}
                  </span>
                </button>

                {isOpen && (
                  <div id={answerId} role="region" aria-labelledby={questionId} className="welcome-faq__answer">
                    <p>{item.answer}</p>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
