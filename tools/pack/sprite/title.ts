import Jagfile from '#/io/Jagfile.js';
import Packet from '#/io/Packet.js';
import Environment from '#/util/Environment.js';
import { shouldBuildFileAny } from '#/util/PackFile.js';
import { convertImage } from '#/util/PixPack.js';

export async function packClientTitle() {
    if (!shouldBuildFileAny(`${Environment.BUILD_SRC_DIR}/binary`, 'data/pack/client/title') && !shouldBuildFileAny(`${Environment.BUILD_SRC_DIR}/fonts`, 'data/pack/client/title') && !shouldBuildFileAny(`${Environment.BUILD_SRC_DIR}/title`, 'data/pack/client/title')) {
        return;
    }

    const order = ['p11.dat', 'p12.dat', 'titlebox.dat', 'title.dat', 'runes.dat', 'q8.dat', 'index.dat', 'titlebutton.dat', 'logo.dat', 'b12.dat'];

    const files: Record<string, Packet> = {};

    const title = Packet.load(`${Environment.BUILD_SRC_DIR}/binary/title.jpg`);
    title.pos = title.data.length;

    files['title.dat'] = title;

    // ----

    const index = Packet.alloc(1);

    // TODO (jkm) check for presence , rather than using `!`

    const p11 = await convertImage(index, `${Environment.BUILD_SRC_DIR}/fonts`, 'p11');
    files['p11.dat'] = p11!;

    const p12 = await convertImage(index, `${Environment.BUILD_SRC_DIR}/fonts`, 'p12');
    files['p12.dat'] = p12!;

    const b12 = await convertImage(index, `${Environment.BUILD_SRC_DIR}/fonts`, 'b12');
    files['b12.dat'] = b12!;

    const q8 = await convertImage(index, `${Environment.BUILD_SRC_DIR}/fonts`, 'q8');
    files['q8.dat'] = q8!;

    const logo = await convertImage(index, `${Environment.BUILD_SRC_DIR}/title`, 'logo');
    files['logo.dat'] = logo!;

    const titlebox = await convertImage(index, `${Environment.BUILD_SRC_DIR}/title`, 'titlebox');
    files['titlebox.dat'] = titlebox!;

    const titlebutton = await convertImage(index, `${Environment.BUILD_SRC_DIR}/title`, 'titlebutton');
    files['titlebutton.dat'] = titlebutton!;

    const runes = await convertImage(index, `${Environment.BUILD_SRC_DIR}/title`, 'runes');
    files['runes.dat'] = runes!;

    files['index.dat'] = index;

    // ----

    const jag = new Jagfile();

    for (let i = 0; i < order.length; i++) {
        const name = order[i];
        const data = files[name];
        // data.save(`dump/title/${name}`, data.length);
        jag.write(name, data);
    }

    jag.save('data/pack/client/title');
    for (const packet of Object.values(files)) {
        packet.release();
    }
}
