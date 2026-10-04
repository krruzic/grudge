// Tiling textures for map features (gates, jump pads, horns, avalanche snow). Each texture() call loads its own
// copy so features can set different repeats.
import * as THREE from "three";
import blockUrlAsset from "../../../assets/textures/wallblock.png?url";
import woodUrlAsset from "../../../assets/textures/wood.png?url";
import ironUrlAsset from "../../../assets/textures/iron.png?url";
import planksUrlAsset from "../../../assets/textures/planks.png?url";
import cobbleUrlAsset from "../../../assets/textures/cobble.png?url";
import snowUrlAsset from "../../../assets/textures/snow.png?url";

export const blockUrl: string = blockUrlAsset;
export const cobbleUrl: string = cobbleUrlAsset;
export const ironUrl: string = ironUrlAsset;
export const planksUrl: string = planksUrlAsset;
export const snowUrl: string = snowUrlAsset;
export const woodUrl: string = woodUrlAsset;

export function texture(url: string, rep = 1): THREE.Texture {
  const t = new THREE.TextureLoader().load(url);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(rep, rep);
  t.colorSpace = THREE.SRGBColorSpace;
  t.magFilter = THREE.LinearFilter;
  return t;
}
