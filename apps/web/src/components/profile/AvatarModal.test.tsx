import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { expect, test, vi } from 'vitest';
import { AvatarModal } from './AvatarModal';
import { api } from '../../lib/api';

vi.mock('../../lib/api', () => ({
  api: {
    getAvatarGroups: vi.fn(),
  },
}));

test('renders character avatars grouped by work and selects one', async () => {
  const user = userEvent.setup();
  const onSave = vi.fn();
  const onClose = vi.fn();

  vi.mocked(api.getAvatarGroups).mockResolvedValue([
    {
      id: 'work-1',
      title: 'Attack on Titan',
      characters: [
        { id: 'c-1', name: 'Eren Yeager', photoUrl: 'https://images.example.com/eren.jpg' },
        { id: 'c-2', name: 'Mikasa Ackerman', photoUrl: 'https://images.example.com/mikasa.jpg' },
      ],
    },
    {
      id: 'work-2',
      title: 'Arcane',
      characters: [
        { id: 'c-3', name: 'Jinx', photoUrl: 'https://images.example.com/jinx.jpg' },
      ],
    },
  ]);

  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <AvatarModal
        isOpen={true}
        currentAvatar="cyan"
        onSave={onSave}
        onClose={onClose}
      />
    </QueryClientProvider>
  );

  expect(screen.getByRole('dialog', { name: /seleção de avatar/i })).toBeInTheDocument();
  expect(await screen.findByText('Attack on Titan')).toBeInTheDocument();
  expect(screen.getByText('Arcane')).toBeInTheDocument();

  const jinxBtn = screen.getByRole('button', { name: /selecionar jinx/i });
  await user.click(jinxBtn);

  const saveBtn = screen.getByRole('button', { name: 'SALVAR' });
  await user.click(saveBtn);

  expect(onSave).toHaveBeenCalledWith('https://images.example.com/jinx.jpg');
  expect(onClose).toHaveBeenCalled();
});
