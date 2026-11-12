import { describe, expect, it } from 'vitest';
import {
    Box3,
    DirectionalLight,
    Group,
    HemisphereLight,
    Mesh,
    MeshBasicMaterial,
    SphereGeometry,
    Vector3,
} from 'three';

import {
    calculateBodyFraming,
    calculateHeadFraming,
    calculatePortraitFraming,
    createLitScene,
    deformedBounds,
} from './renderSprites';

describe('A14 — renderSprites (cadrages, déformation et éclairage)', () => {
    it('calcule un cadrage portrait centré sur le haut du corps (512x512)', () => {
        // Corps simulé de y = 0 à y = 180 (hauteur 180), centré en x = 0
        const bodyBounds = new Box3(new Vector3(-40, 0, -20), new Vector3(40, 180, 20));
        const framing = calculatePortraitFraming(bodyBounds, 512);

        expect(framing.width).toBe(512);
        expect(framing.height).toBe(512);

        const cam = framing.camera;
        // Aspect ratio 1:1
        expect(cam.right - cam.left).toBeCloseTo(cam.top - cam.bottom);

        // Position de caméra centrée en x = 0 et au niveau du haut du corps en y
        expect(cam.position.x).toBeCloseTo(0);
        expect(cam.position.y).toBeGreaterThan(100);
        expect(cam.position.z).toBeGreaterThan(0);
    });

    it('calcule un cadrage tête avec 12 % de marge (256x256)', () => {
        // Tête de 20x20x20 centrée en [0, 160, 0]
        const headBounds = new Box3(new Vector3(-10, 150, -10), new Vector3(10, 170, 10));
        const framing = calculateHeadFraming(headBounds, 256);

        expect(framing.width).toBe(256);
        expect(framing.height).toBe(256);

        const cam = framing.camera;
        const windowWidth = cam.right - cam.left;
        const expectedExtent = 20 * 1.12; // 22.4
        expect(windowWidth).toBeCloseTo(expectedExtent);
        expect(cam.position.y).toBeCloseTo(160);
    });

    it('calcule un cadrage corps 256x512 avec pieds sur la marge basse', () => {
        const bodyBounds = new Box3(new Vector3(-40, 0, -20), new Vector3(40, 180, 20));
        // Accessoire étendant la largeur (ex: F1 ou chariot)
        const fullBounds = new Box3(new Vector3(-120, 0, -20), new Vector3(120, 180, 20));

        const framing = calculateBodyFraming(bodyBounds, fullBounds, 256, 512);

        expect(framing.width).toBe(256);
        expect(framing.height).toBe(512);

        const cam = framing.camera;
        const windowWidth = cam.right - cam.left;
        const windowHeight = cam.top - cam.bottom;

        // Ratio hauteur/largeur de la fenêtre orthographique conforme à 512/256 = 2:1
        expect(windowHeight / windowWidth).toBeCloseTo(2.0);

        // La caméra englobe bien la largeur de l'accessoire
        expect(windowWidth).toBeGreaterThan(240);
    });

    it('calcule fidèlement les limites déformées d un objet', () => {
        const group = new Group();
        const mesh = new Mesh(new SphereGeometry(10), new MeshBasicMaterial());
        mesh.position.set(50, 100, 0);
        group.add(mesh);

        const bounds = deformedBounds(group);
        expect(bounds.min.x).toBeCloseTo(40, 0);
        expect(bounds.max.x).toBeCloseTo(60, 0);
        expect(bounds.min.y).toBeCloseTo(90, 0);
        expect(bounds.max.y).toBeCloseTo(110, 0);
    });

    it('configure un éclairage studio standardisé (hemisphere sol #4a5568 + directional 2.2)', () => {
        const obj = new Group();
        const scene = createLitScene(obj);

        expect(scene.children.length).toBe(3); // hemi + key + obj

        const hemi = scene.children.find((c): c is HemisphereLight => (c as HemisphereLight).isHemisphereLight);
        expect(hemi).toBeDefined();
        expect(hemi?.intensity).toBe(2.4);
        expect(hemi?.groundColor.getHexString()).toBe('4a5568');

        const key = scene.children.find((c): c is DirectionalLight => (c as DirectionalLight).isDirectionalLight);
        expect(key).toBeDefined();
        expect(key?.intensity).toBe(2.2);
        expect(key?.position.x).toBeCloseTo(0.6);
        expect(key?.position.y).toBeCloseTo(2.4);
        expect(key?.position.z).toBeCloseTo(3);
    });
});
