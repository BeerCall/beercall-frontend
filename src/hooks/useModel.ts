import { useLoader } from '@react-three/fiber';
import { PreparedModelLoader } from '../lib/PreparedModelLoader';

export function useModel(path: string) {
    return useLoader(PreparedModelLoader, path);
}
useModel.preload = (path: string) => useLoader.preload(PreparedModelLoader, path);
useModel.clear = (path: string) => useLoader.clear(PreparedModelLoader, path);
