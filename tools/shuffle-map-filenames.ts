import fs from 'fs/promises';
import path from 'path';

/**
 * shuffle-map-filenames.ts
 *
 * This script shuffles the filenames of files starting with a specified prefix
 * (default 'm') within a given directory. The set of filenames remains the same,
 * but the content associated with each filename is randomly reassigned from
 * another file in the set.
 *
 * It can also be configured to ignore files that only contain specific "unwalkable"
 * block types (e.g., "u48").
 *
 * WARNING: This is a destructive operation. It directly renames files on your
 * file system. ALWAYS BACK UP YOUR TARGET DIRECTORY BEFORE RUNNING THIS SCRIPT.
 *
 * If these are game map files, shuffling them will change which map data loads
 * for which map identifier/coordinate. You will likely need to clear any
 * cached or packed versions of these maps and regenerate them for the changes
 * to take effect in your application/game.
 */

// --- Configuration ---
const TARGET_DIRECTORY = 'data/src/maps'; // Relative to the project root
const FILE_PREFIX = 'm';
const FILE_TO_IGNORE = 'multiway.csv'; // File to exclude from shuffling
const UNWALKABLE_BLOCK_TYPE = 'u48'; // Identifier for blocks that make a file "unwalkable only"
const CONFIRMATION_DELAY_SECONDS = 5; // Safety delay before execution
// --- End Configuration ---

// Fisher-Yates shuffle algorithm
function shuffleArray<T>(array: T[]): T[] {
    const shuffled = [...array]; // Create a copy
    for (let i = shuffled.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    return shuffled;
}

/**
 * Checks if a file contains only "unwalkable" blocks within its MAP data section.
 * An unwalkable block is defined by lines matching "X Y Z: UNWALKABLE_BLOCK_TYPE".
 * The file is considered "unwalkable only" if all its map data lines (under "==== MAP ====")
 * match this pattern, and there's at least one such map data line.
 * @param filePath The absolute path to the file.
 * @param unwalkableType The string identifier for the unwalkable block (e.g., "u48").
 * @returns True if the file only contains unwalkable blocks in its map section, false otherwise.
 */
async function isUnwalkableOnly(filePath: string, unwalkableType: string): Promise<boolean> {
    try {
        const content = await fs.readFile(filePath, 'utf-8');
        const lines = content.split(/\r?\n/); // Handle LF and CRLF

        let inMapSection = false;
        let foundAnyMapData = false;
        let foundNonUnwalkableMapData = false;
        let foundAtLeastOneU48BlockInMap = false;

        const mapHeaderPattern = /^====\s*MAP\s*====$/;
        const otherHeaderPattern = /^====\s*(LOC|NPC)\s*====$/; // Sections that end the map data
        // Regex to capture map data lines and their block type(s)
        const mapDataPattern = /^\d+\s+\d+\s+\d+:\s*(.*)$/;

        for (const line of lines) {
            const trimmedLine = line.trim();

            if (trimmedLine === '' || trimmedLine.startsWith('//') || trimmedLine.startsWith('#')) {
                // Ignore empty lines and comments
                continue;
            }

            if (mapHeaderPattern.test(trimmedLine)) {
                inMapSection = true;
                continue;
            }

            if (otherHeaderPattern.test(trimmedLine)) {
                // If we encounter another header (like LOC or NPC),
                // we are no longer in the primary MAP data section for tile definitions.
                inMapSection = false;
                continue;
            }

            if (inMapSection) {
                const match = trimmedLine.match(mapDataPattern);
                if (match) {
                    foundAnyMapData = true;
                    const blockData = match[1].trim(); // Get the part after "X Y Z: "
                    if (blockData === unwalkableType) {
                        foundAtLeastOneU48BlockInMap = true;
                    } else {
                        // This map data line is NOT the target unwalkable type.
                        foundNonUnwalkableMapData = true;
                        break; // No need to check further; the map is not "unwalkable only"
                    }
                }
                // Lines within ==== MAP ==== that don't match X Y Z: type are ignored for this check
            }
        }
        // Considered "unwalkable only" if:
        // 1. We actually found map data lines.
        // 2. We did NOT find any map data lines that were of a different type.
        // 3. We found at least one map data line that WAS of the unwalkableType.
        if (foundNonUnwalkableMapData) {
            return false;
        }
        return foundAnyMapData && foundAtLeastOneU48BlockInMap;
    } catch (error) {
        console.warn(`  Warning: Could not read or process file ${path.basename(filePath)} for unwalkable check:`, error instanceof Error ? error.message : String(error));
        return false; // Treat as not unwalkable-only if there's an error reading it
    }
}


async function shuffleFilenamesInDirectory(directoryPath: string, prefix: string): Promise<void> {
    console.log(`Starting filename shuffle for files starting with "${prefix}" in directory: ${directoryPath}`);
    console.warn('!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!');
    console.warn('!!! WARNING: This operation is DESTRUCTIVE and will PERMANENTLY RENAME   !!!');
    console.warn('!!! files. Make ABSOLUTELY SURE you have a BACKUP of your data.        !!!');
    console.warn('!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!');
    console.log(`Proceeding with shuffle in ${CONFIRMATION_DELAY_SECONDS} seconds... (Press Ctrl+C to cancel)`);
    await new Promise(resolve => setTimeout(resolve, CONFIRMATION_DELAY_SECONDS * 1000));

    try {
        const absoluteDirectoryPath = path.resolve(directoryPath);
        const entries = await fs.readdir(absoluteDirectoryPath, { withFileTypes: true });

        // Initial filter based on type, prefix, and general ignore list
        const candidateEntries = entries
            .filter(entry => entry.isFile() && entry.name.startsWith(prefix) && entry.name !== FILE_TO_IGNORE);

        const originalFilenames: string[] = [];
        if (candidateEntries.length > 0) {
            console.log('\nChecking file contents to filter out unwalkable-only maps (this may take a moment)...');
        }
        for (const entry of candidateEntries) {
            const filePath = path.join(absoluteDirectoryPath, entry.name);
            if (await isUnwalkableOnly(filePath, UNWALKABLE_BLOCK_TYPE)) {
                console.log(`  Skipping "${entry.name}": contains only "${UNWALKABLE_BLOCK_TYPE}" blocks in its map data section.`);
            } else {
                originalFilenames.push(entry.name);
            }
        }

        if (originalFilenames.length < 2) {
            console.log('Not enough eligible files matching the prefix to shuffle (need at least 2 after filtering). Exiting.');
            return;
        }

        console.log('\nOriginal eligible files to be shuffled:', originalFilenames);

        const shuffledTargetNames = shuffleArray([...originalFilenames]);

        // Ensure the shuffle actually changed the order for a noticeable effect.
        // A true random shuffle could result in the same order, especially with few items.
        const isOrderChanged = originalFilenames.some((name, index) => name !== shuffledTargetNames[index]);
        if (!isOrderChanged && originalFilenames.length > 1) {
            console.log('Note: The shuffle resulted in the same order as the original. This can happen by chance.');
            // For a utility, you might offer to re-shuffle or just proceed. We'll proceed.
        }
        console.log('Target shuffled names (original file content will be moved to these names):', shuffledTargetNames);

        const tempSuffix = `_shuffle_temp_${Date.now()}`;
        const renamePlan = originalFilenames.map((originalName, index) => ({
            originalName,
            tempName: originalName + tempSuffix,
            finalNewName: shuffledTargetNames[index],
        }));

        // Stage 1: Rename original files to temporary names
        console.log('\nStage 1: Renaming original files to temporary names...');
        for (const { originalName, tempName } of renamePlan) {
            const oldPath = path.join(absoluteDirectoryPath, originalName);
            const tempPath = path.join(absoluteDirectoryPath, tempName);
            console.log(`  ${originalName} -> ${tempName}`);
            await fs.rename(oldPath, tempPath);
        }
        console.log('Stage 1 complete.');

        // Stage 2: Rename temporary files to their final shuffled names
        console.log('\nStage 2: Renaming temporary names to final shuffled names...');
        for (const { tempName, finalNewName } of renamePlan) {
            const tempPath = path.join(absoluteDirectoryPath, tempName);
            const newPath = path.join(absoluteDirectoryPath, finalNewName);
            console.log(`  ${tempName} (contains original content of its base name) -> ${finalNewName}`);
            await fs.rename(tempPath, newPath);
        }
        console.log('Stage 2 complete.');
        console.log('\nFilename shuffle successful!');
        console.log(`Files in "${absoluteDirectoryPath}" starting with "${prefix}" have been shuffled.`);
        console.log('Remember to clear any game caches and repack data if necessary.');

    } catch (error) {
        console.error('\n--- ERROR DURING FILE SHUFFLING ---');
        console.error(error instanceof Error ? error.message : String(error));
        console.error('The file system in the target directory may be in an inconsistent state. Please review the files manually and restore from backup if needed.');
    }
}

shuffleFilenamesInDirectory(TARGET_DIRECTORY, FILE_PREFIX).catch(console.error);
