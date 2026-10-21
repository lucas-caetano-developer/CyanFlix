import { afterEach, expect, test, vi } from 'vitest';
import {
  SPATIAL_FOCUS_ATTRIBUTE,
  collectSpatialCandidates,
  findSpatialDestination,
  focusSpatialElement,
  isSpatialElement,
  isTextEntryTarget,
} from './spatialNavigation';

const cleanupElements: HTMLElement[] = [];

function rect(left: number, top: number, width = 160, height = 240): DOMRect {
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

function createButton(label: string, box: DOMRect, parent: HTMLElement = document.body): HTMLButtonElement {
  const button = document.createElement('button');
  button.textContent = label;
  button.getBoundingClientRect = () => box;
  button.getClientRects = () => [box] as unknown as DOMRectList;
  parent.appendChild(button);
  cleanupElements.push(button);
  return button;
}

afterEach(() => {
  cleanupElements.splice(0).forEach((element) => element.remove());
  vi.restoreAllMocks();
});

test('moves horizontally and vertically using geometry without wrapping', () => {
  const root = document.createElement('section');
  document.body.appendChild(root);
  const first = createButton('Primeiro', rect(0, 0), root);
  const second = createButton('Segundo', rect(180, 0), root);
  const third = createButton('Terceiro', rect(360, 0), root);
  const below = createButton('Abaixo', rect(0, 270), root);
  const candidates = collectSpatialCandidates(root);

  expect(findSpatialDestination(candidates, first, 'right')).toBe(second);
  expect(findSpatialDestination(candidates, second, 'right')).toBe(third);
  expect(findSpatialDestination(candidates, first, 'down')).toBe(below);
  expect(findSpatialDestination(candidates, first, 'left')).toBeNull();
  expect(findSpatialDestination(candidates, below, 'down')).toBeNull();

  root.remove();
});

test('prefers the aligned card on the next row', () => {
  const root = document.createElement('section');
  document.body.appendChild(root);
  const current = createButton('Atual', rect(200, 0), root);
  const farLeft = createButton('Esquerda', rect(0, 270), root);
  const aligned = createButton('Alinhado', rect(200, 270), root);
  const farRight = createButton('Direita', rect(420, 270), root);
  const candidates = collectSpatialCandidates(root);

  expect(findSpatialDestination(candidates, current, 'down')).toBe(aligned);
  expect(findSpatialDestination(candidates, current, 'down')).not.toBe(farLeft);
  expect(findSpatialDestination(candidates, current, 'down')).not.toBe(farRight);

  root.remove();
});

test('keeps horizontal movement inside a carousel rail boundary', () => {
  const root = document.createElement('section');
  const rail = document.createElement('div');
  rail.setAttribute('data-spatial-row', 'true');
  root.appendChild(rail);
  document.body.appendChild(root);
  const first = createButton('Primeiro', rect(0, 0), rail);
  const last = createButton('Último', rect(180, 0), rail);
  const heroControl = createButton('Controle do Hero', rect(420, -120), root);
  const nextRow = createButton('Próxima fileira', rect(420, 270), root);
  const candidates = collectSpatialCandidates(root);

  expect(findSpatialDestination(candidates, first, 'right')).toBe(last);
  expect(findSpatialDestination(candidates, last, 'right')).toBeNull();
  expect(findSpatialDestination(candidates, first, 'down')).toBe(nextRow);
  expect(findSpatialDestination(candidates, first, 'down')).not.toBe(heroControl);

  root.remove();
});

test('ignores hidden, inert and disabled controls', () => {
  const root = document.createElement('section');
  document.body.appendChild(root);
  createButton('Visível', rect(0, 0), root);
  const disabled = createButton('Desabilitado', rect(180, 0), root);
  disabled.disabled = true;
  const hidden = createButton('Oculto', rect(360, 0), root);
  hidden.hidden = true;
  const ariaHidden = createButton('Aria oculto', rect(540, 0), root);
  ariaHidden.setAttribute('aria-hidden', 'true');

  const labels = collectSpatialCandidates(root).map((element) => element.textContent);
  expect(labels).toEqual(['Visível']);
  expect(isSpatialElement(disabled)).toBe(false);
  expect(isSpatialElement(hidden)).toBe(false);
  expect(isSpatialElement(ariaHidden)).toBe(false);

  root.remove();
});

test('keeps text fields, selects and sliders under native keyboard control', () => {
  const input = document.createElement('input');
  const checkbox = document.createElement('input');
  checkbox.type = 'checkbox';
  const select = document.createElement('select');
  const slider = document.createElement('div');
  slider.setAttribute('role', 'slider');
  const textarea = document.createElement('textarea');
  const contentEditable = document.createElement('div');
  contentEditable.setAttribute('contenteditable', 'true');
  const button = document.createElement('button');

  expect(isTextEntryTarget(input)).toBe(true);
  expect(isTextEntryTarget(select)).toBe(true);
  expect(isTextEntryTarget(slider)).toBe(true);
  expect(isTextEntryTarget(textarea)).toBe(true);
  expect(isTextEntryTarget(contentEditable)).toBe(true);
  expect(isTextEntryTarget(checkbox)).toBe(false);
  expect(isTextEntryTarget(button)).toBe(false);
});

test('marks the focused destination for a strong keyboard focus ring', () => {
  const button = createButton('Destino', rect(0, 0));
  focusSpatialElement(button);

  expect(button).toHaveFocus();
  expect(button).toHaveAttribute(SPATIAL_FOCUS_ATTRIBUTE);
});
