import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { Work } from '../../lib/types';
import { ContentRow } from './ContentRow';

const router = { future: { v7_startTransition: true, v7_relativeSplatPath: true } };

test('renders nothing for an empty row', () => {
  const { container } = render(<MemoryRouter {...router}><ContentRow title="Vazia" items={[]} /></MemoryRouter>);
  expect(container).toBeEmptyDOMElement();
});

test('hides navigation controls when a single item does not need scrolling', () => {
  const items: Work[] = [{ id: 'only-one', title: 'Único', contentKind: 'movie' }];
  render(<MemoryRouter {...router}><ContentRow title="Destaque" items={items} /></MemoryRouter>);
  expect(screen.getByRole('heading', { name: 'Destaque' })).toBeInTheDocument();
  expect(screen.queryByRole('button', { name: /Voltar em Destaque/ })).not.toBeInTheDocument();
  expect(screen.queryByRole('button', { name: /Avançar em Destaque/ })).not.toBeInTheDocument();
});

test('omits the kind badge when the row title already states it', () => {
  const items: Work[] = [{ id: 'movie-1', title: 'Duna', contentKind: 'movie' }];
  render(<MemoryRouter {...router}><ContentRow title="Filmes" items={items} /></MemoryRouter>);
  expect(screen.queryByText('Filme')).not.toBeInTheDocument();
});
