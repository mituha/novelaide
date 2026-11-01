import { describe, it, expect } from 'vitest';
import * as metadataPlugin from '../index';

describe('tauri-plugin-novelaid-metadata API exports', () => {
  it('should export all metadata management functions', () => {
    expect(typeof metadataPlugin.scanProject).toBe('function');
    expect(typeof metadataPlugin.indexDocuments).toBe('function');
    expect(typeof metadataPlugin.indexDocument).toBe('function');
    expect(typeof metadataPlugin.getMetadataCache).toBe('function');
    expect(typeof metadataPlugin.getEntities).toBe('function');
    expect(typeof metadataPlugin.getRubyDictionary).toBe('function');
    expect(typeof metadataPlugin.getCalibrationContext).toBe('function');
    expect(typeof metadataPlugin.updateFileMetadata).toBe('function');
  });
});
