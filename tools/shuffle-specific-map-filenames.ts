import fs from 'fs/promises';
import path from 'path';

/**
 * shuffle-specific-map-filenames.ts
 *
 * This script shuffles the filenames of a SPECIFIC LIST of map files
 * within a given directory. The set of filenames remains the same,
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
const UNWALKABLE_BLOCK_TYPE = 'u48'; // Identifier for blocks that make a file "unwalkable only"
const CONFIRMATION_DELAY_SECONDS = 5; // Safety delay before execution

// List of specific map files (base names without .jm2 extension) to shuffle
const SPECIFIC_FILES_TO_SHUFFLE_BASE = [
    'm37_52', 'm37_53', 'm37_54', 'm37_73', 'm38_151', 'm38_154', 'm38_49',
    'm38_50', 'm38_51', 'm38_52', 'm38_53', 'm38_54', 'm39_147', 'm39_46',
    'm39_47', 'm39_48', 'm39_49', 'm39_50', 'm39_51', 'm39_52', 'm39_53',
    'm39_54', 'm39_55', 'm40_46', 'm40_47', 'm40_48', 'm40_49', 'm40_50',
    'm40_51', 'm40_52', 'm40_53', 'm40_54', 'm41_46', 'm41_48', 'm41_49',
    'm41_50', 'm41_51', 'm41_52', 'm41_53', 'm41_54', 'm41_55', 'm41_73',
    'm42_49', 'm42_50', 'm42_51', 'm42_52', 'm42_53', 'm42_54', 'm42_55',
    'm43_45', 'm43_46', 'm43_47', 'm43_48', 'm43_49', 'm43_50', 'm43_52',
    'm43_53', 'm43_54', 'm43_73', 'm44_45', 'm44_46', 'm44_47', 'm44_48',
    'm44_49', 'm44_50', 'm44_51', 'm44_52', 'm44_53', 'm44_54', 'm44_55',
    'm45_45', 'm45_46', 'm45_47', 'm45_48', 'm45_49', 'm45_50', 'm45_51',
    'm45_52', 'm45_53', 'm45_54', 'm46_45', 'm46_46', 'm46_47', 'm46_49',
    'm46_50', 'm46_51', 'm46_52', 'm46_53', 'm46_54', 'm46_55', 'm46_56',
    'm46_57', 'm46_58', 'm46_59', 'm46_60', 'm46_61', 'm47_49', 'm47_50',
    'm47_51', 'm47_52', 'm47_53', 'm47_54', 'm47_55', 'm47_56', 'm47_57',
    'm47_58', 'm47_59', 'm47_60', 'm47_61', 'm48_49', 'm48_50', 'm48_51',
    'm48_52', 'm48_53', 'm48_54', 'm48_55', 'm48_56', 'm48_57', 'm48_58',
    'm48_59', 'm48_60', 'm48_61', 'm49_47', 'm49_49', 'm49_50', 'm49_51',
    'm49_52', 'm49_53', 'm49_54', 'm49_55', 'm49_56', 'm49_57', 'm49_58',
    'm49_59', 'm49_60', 'm49_61', 'm50_47', 'm50_48', 'm50_49', 'm50_50',
    'm50_51', 'm50_52', 'm50_53', 'm50_54', 'm50_55', 'm50_56', 'm50_57',
    'm50_58', 'm50_59', 'm50_60', 'm50_61', 'm51_47', 'm51_48', 'm51_49',
    'm51_50', 'm51_51', 'm51_52', 'm51_53', 'm51_54', 'm51_55', 'm51_56',
    'm51_57', 'm51_58', 'm51_59', 'm51_60', 'm51_61', 'm52_51', 'm52_52',
    'm52_53'
];
const FILE_EXTENSION = '.jm2';
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
        if (error instanceof Error && 'code' in error && error.code === 'ENOENT') {
            console.warn(`  Warning: File ${path.basename(filePath)} not found. It will be excluded from shuffling.`);
        } else {
            console.warn(`  Warning: Could not read or process file ${path.basename(filePath)} for unwalkable check:`, error instanceof Error ? error.message : String(error));
        }
        return false; // Treat as not unwalkable-only if there's an error reading it or it's not found
    }
}


async function shuffleSpecificFiles(directoryPath: string, baseFilenames: string[]): Promise<void> {
    console.log(`Starting filename shuffle for a specific list of ${baseFilenames.length} files in directory: ${directoryPath}`);
    console.warn('!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!');
    console.warn('!!! WARNING: This operation is DESTRUCTIVE and will PERMANENTLY RENAME   !!!');
    console.warn('!!! files. Make ABSOLUTELY SURE you have a BACKUP of your data.        !!!');
    console.warn('!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!');
    console.log(`Proceeding with shuffle in ${CONFIRMATION_DELAY_SECONDS} seconds... (Press Ctrl+C to cancel)`);
    await new Promise(resolve => setTimeout(resolve, CONFIRMATION_DELAY_SECONDS * 1000));

    try {
        const absoluteDirectoryPath = path.resolve(directoryPath);
        const originalFilenames: string[] = [];

        console.log('\nChecking specified files for existence and content (this may take a moment)...');
        for (const baseName of baseFilenames) {
            const fileNameWithExt = baseName + FILE_EXTENSION;
            const filePath = path.join(absoluteDirectoryPath, fileNameWithExt);

            // First, check if the file exists before attempting to read its content
            try {
                await fs.access(filePath); // Checks if file exists and is accessible
            } catch (_e) {
                console.log(`  Skipping "${fileNameWithExt}": File not found at ${filePath}.`);
                continue;
            }

            if (await isUnwalkableOnly(filePath, UNWALKABLE_BLOCK_TYPE)) {
                console.log(`  Skipping "${fileNameWithExt}": contains only "${UNWALKABLE_BLOCK_TYPE}" blocks in its map data section.`);
            } else {
                originalFilenames.push(fileNameWithExt);
            }
        }

        if (originalFilenames.length < 2) {
            console.log('Not enough eligible files from the specified list to shuffle (need at least 2 after filtering). Exiting.');
            return;
        }

        console.log('\nOriginal eligible files to be shuffled:', originalFilenames);

        const shuffledTargetNames = shuffleArray([...originalFilenames]);

        const isOrderChanged = originalFilenames.some((name, index) => name !== shuffledTargetNames[index]);
        if (!isOrderChanged && originalFilenames.length > 1) {
            console.log('Note: The shuffle resulted in the same order as the original. This can happen by chance.');
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
        console.log(`Specified files in "${absoluteDirectoryPath}" have been shuffled.`);
        console.log('Remember to clear any game caches and repack data if necessary.');

    } catch (error) {
        console.error('\n--- ERROR DURING FILE SHUFFLING ---');
        console.error(error instanceof Error ? error.message : String(error));
        console.error('The file system in the target directory may be in an inconsistent state. Please review the files manually and restore from backup if needed.');
    }
}

shuffleSpecificFiles(TARGET_DIRECTORY, SPECIFIC_FILES_TO_SHUFFLE_BASE).catch(console.error);
