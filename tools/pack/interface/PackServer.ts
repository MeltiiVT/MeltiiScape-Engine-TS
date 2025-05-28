import Environment from '#/util/Environment.js';
import { shouldBuild } from '#/util/PackFile.js';
import { packInterface } from '#tools/pack/interface/PackShared.js';

export function packServerInterface() {
    if (shouldBuild(`${Environment.BUILD_SRC_DIR}/scripts`, '.if', 'data/pack/server/interface.dat') || shouldBuild('src/cache/packinterface', '.ts', 'data/pack/server/interface.dat')) {
        const data = packInterface(true);
        data.save('data/pack/server/interface.dat');
        data.release();
    }
}
