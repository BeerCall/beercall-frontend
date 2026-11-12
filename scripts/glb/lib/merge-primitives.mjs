/**
 * A04 — Optimisation hors ligne : fusion des primitives d'un GLB publié par
 * matériau *et attributs compatibles à l'intérieur d'un même mesh*.
 *
 * `gltf-transform join` ignore volontairement les nœuds skinnés : les pièces
 * FBX conservent une primitive par sous-objet. Fusionner seulement les primitives
 * d'un même mesh ne touche ni le nœud, ni son skin, ni ses os, ni les matériaux,
 * ni les données de sommet ; seul le nombre de draw calls baisse. On ne fusionne
 * donc jamais deux skins distincts.
 */
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { joinPrimitives } from '@gltf-transform/functions';
import { MeshoptDecoder } from 'meshoptimizer';

/** NodeIO complet : conserve les extensions (dont compression Meshopt) d'un GLB. */
export function createNodeIO() {
    return new NodeIO()
        .registerExtensions(ALL_EXTENSIONS)
        .registerDependencies({ 'meshopt.decoder': MeshoptDecoder });
}

/** Clé stable reprenant les propriétés que `joinPrimitives` exige égales. */
function groupKey(root, primitive) {
    const material = primitive.getMaterial();
    const materialIndex = material ? root.listMaterials().indexOf(material) : -1;
    const semantics = primitive
        .listSemantics()
        .sort()
        .map((semantic) => {
            const attribute = primitive.getAttribute(semantic);
            return `${semantic}:${attribute.getElementSize()}:${attribute.getComponentType()}`;
        })
        .join('+');
    return `${materialIndex}|${primitive.getMode()}|${Boolean(primitive.getIndices())}|${semantics}`;
}

/**
 * Fusionne les primitives compatibles de chaque mesh en une primitive par
 * matériau. Retourne les compteurs avant/après et le nombre de groupes fusionnés.
 */
export async function mergePrimitivesByMaterial(input, output) {
    const io = createNodeIO();
    const document = await io.read(input);
    const root = document.getRoot();
    let before = 0;
    let after = 0;
    let joinedGroups = 0;

    for (const mesh of root.listMeshes()) {
        const primitives = mesh.listPrimitives();
        before += primitives.length;
        const groups = new Map();
        for (const primitive of primitives) {
            if (primitive.listTargets().length > 0) continue;
            const key = groupKey(root, primitive);
            if (!groups.has(key)) groups.set(key, []);
            groups.get(key).push(primitive);
        }
        const joined = [];
        const consumed = new Set();
        for (const group of groups.values()) {
            if (group.length > 1) {
                joined.push(joinPrimitives(group));
                joinedGroups += 1;
                for (const primitive of group) consumed.add(primitive);
            }
        }
        if (joined.length === 0) {
            after += primitives.length;
            continue;
        }
        for (const primitive of primitives) mesh.removePrimitive(primitive);
        for (const primitive of primitives) {
            if (!consumed.has(primitive)) {
                mesh.addPrimitive(primitive);
                after += 1;
            }
        }
        for (const primitive of joined) {
            mesh.addPrimitive(primitive);
            after += 1;
        }
    }

    await io.write(output, document);
    return { before, after, joinedGroups };
}
