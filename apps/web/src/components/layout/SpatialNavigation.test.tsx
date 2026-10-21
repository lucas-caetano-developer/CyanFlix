import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { afterEach, expect, test } from 'vitest';
import { SpatialNavigation } from './SpatialNavigation';

const cleanupElements: HTMLElement[] = [];

function rect(left: number, top: number, width = 160, height = 90): DOMRect {
  return {
    left,
    top,
    width,
    height,
    right: left + width,
    bottom: top + height,
    x: left,
    y: top,
    toJSON: () => ({}),
  } as DOMRect;
}

function layout(element: HTMLElement, box: DOMRect): HTMLElement {
  element.getBoundingClientRect = () => box;
  element.getClientRects = () => [box] as unknown as DOMRectList;
  return element;
}

function createButton(label: string, box: DOMRect, parent: HTMLElement = document.body): HTMLButtonElement {
  const button = document.createElement('button');
  button.textContent = label;
  layout(button, box);
  parent.appendChild(button);
  cleanupElements.push(button);
  return button;
}

function LocationProbe() {
  const location = useLocation();
  return <output data-testid="location">{location.pathname}</output>;
}

function renderNavigation(entry = '/browse') {
  return render(
    <MemoryRouter initialEntries={[entry]} future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
      <SpatialNavigation />
      <Routes>
        <Route path="*" element={<LocationProbe />} />
      </Routes>
    </MemoryRouter>,
  );
}

afterEach(() => {
  cleanupElements.splice(0).forEach((element) => element.remove());
  document.body.removeAttribute('data-input');
});

test('moves focus through a registered scope and leaves Tab alone', () => {
  const scope = layout(document.createElement('main'), rect(0, 0, 900, 600));
  scope.setAttribute('data-spatial-scope', 'streaming');
  document.body.appendChild(scope);
  const first = createButton('Primeiro', rect(0, 0), scope);
  const second = createButton('Segundo', rect(200, 0), scope);
  cleanupElements.push(scope);
  renderNavigation();

  expect(fireEvent.keyDown(window, { key: 'ArrowRight' })).toBe(false);
  expect(first).toHaveFocus();
  fireEvent.keyDown(window, { key: 'ArrowRight' });
  expect(second).toHaveFocus();

  const tabAllowed = fireEvent.keyDown(window, { key: 'Tab' });
  expect(tabAllowed).toBe(true);
  expect(second).toHaveFocus();
});

test('does not steal arrows from text fields or sliders', () => {
  const scope = layout(document.createElement('main'), rect(0, 0, 900, 600));
  scope.setAttribute('data-spatial-scope', 'streaming');
  document.body.appendChild(scope);
  const input = document.createElement('input');
  input.getBoundingClientRect = () => rect(20, 120);
  input.getClientRects = () => [rect(20, 120)] as unknown as DOMRectList;
  const first = createButton('Primeiro', rect(0, 0), scope);
  scope.appendChild(input);
  cleanupElements.push(scope);
  renderNavigation();

  input.focus();
  expect(fireEvent.keyDown(input, { key: 'ArrowRight' })).toBe(true);
  expect(input).toHaveFocus();
  expect(first).not.toHaveFocus();

  const slider = document.createElement('div');
  slider.setAttribute('role', 'slider');
  slider.tabIndex = 0;
  layout(slider, rect(20, 220));
  scope.appendChild(slider);
  slider.focus();
  fireEvent.keyDown(slider, { key: 'ArrowLeft' });
  expect(slider).toHaveFocus();
});

test('isolates directional focus inside an open overlay', () => {
  createButton('Fora', rect(0, 0));
  const main = layout(document.createElement('main'), rect(0, 0, 900, 600));
  main.setAttribute('data-spatial-scope', 'streaming');
  document.body.appendChild(main);
  createButton('Conteúdo', rect(0, 400), main);
  cleanupElements.push(main);

  const overlay = layout(document.createElement('div'), rect(600, 40, 260, 260));
  overlay.setAttribute('data-spatial-scope', 'account-menu');
  overlay.setAttribute('data-spatial-overlay', 'true');
  document.body.appendChild(overlay);
  const account = createButton('Conta', rect(600, 50), overlay);
  const logout = createButton('Sair', rect(600, 140), overlay);
  cleanupElements.push(overlay);

  renderNavigation();
  account.focus();
  fireEvent.keyDown(window, { key: 'ArrowDown' });
  expect(logout).toHaveFocus();
  fireEvent.keyDown(window, { key: 'ArrowRight' });
  expect(logout).toHaveFocus();
});

test('prefers an explicit initial destination in a new scope', () => {
  const scope = layout(document.createElement('main'), rect(0, 0, 900, 600));
  scope.setAttribute('data-spatial-scope', 'profiles');
  document.body.appendChild(scope);
  createButton('Ajustar', rect(0, 0), scope);
  const profile = createButton('Perfil', rect(200, 0), scope);
  profile.setAttribute('data-spatial-initial', 'true');
  cleanupElements.push(scope);

  renderNavigation('/profiles');
  fireEvent.keyDown(window, { key: 'ArrowDown' });
  expect(profile).toHaveFocus();
});

test('keeps the player own shortcuts until one of its controls is focused', () => {
  const player = layout(document.createElement('div'), rect(0, 0, 900, 600));
  player.setAttribute('data-spatial-scope', 'player');
  player.setAttribute('data-spatial-player', 'true');
  document.body.appendChild(player);
  const back = createButton('Voltar', rect(20, 20), player);
  const settings = createButton('Configurações', rect(120, 20), player);
  cleanupElements.push(player);

  renderNavigation('/watch/episode/1');
  (document.activeElement as HTMLElement | null)?.blur();
  expect(fireEvent.keyDown(window, { key: 'ArrowRight' })).toBe(true);
  expect(back).not.toHaveFocus();

  back.focus();
  fireEvent.keyDown(window, { key: 'ArrowRight' });
  expect(settings).toHaveFocus();
});

test('uses Escape as a contextual back action outside root routes', async () => {
  renderNavigation('/title/work-1');
  expect(screen.getByTestId('location')).toHaveTextContent('/title/work-1');

  fireEvent.keyDown(window, { key: 'Escape' });
  await waitFor(() => expect(screen.getByTestId('location')).toHaveTextContent('/browse'));
});

test('does not intercept Enter on focused links and buttons', () => {
  const scope = layout(document.createElement('main'), rect(0, 0, 900, 600));
  scope.setAttribute('data-spatial-scope', 'streaming');
  document.body.appendChild(scope);
  const button = createButton('Abrir', rect(0, 0), scope);
  cleanupElements.push(scope);
  renderNavigation();

  button.focus();
  expect(fireEvent.keyDown(button, { key: 'Enter' })).toBe(true);
  expect(button).toHaveFocus();
});
