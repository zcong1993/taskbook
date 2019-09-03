#!/usr/bin/env node
'use strict';
const crypto = require('crypto');
const fs = require('fs');
const os = require('os');
const path = require('path');
const config = require('./config');
const render = require('./render');
const { createInstance } = require('./dynamo');

const {basename, join} = path;

class Storage {
  constructor() {
    this._storageDir = join(this._mainAppDir, 'storage');
    this._archiveDir = join(this._mainAppDir, 'archive');
    this._tempDir = join(this._mainAppDir, '.temp');
    this._archiveFile = join(this._archiveDir, 'archive.json');
    this._mainStorageFile = join(this._storageDir, 'storage.json');
    this._mainStorageDynamoKey = 'storage.json';
    this._archiveDynamoKey = 'storage.json';

    this._ensureDirectories();
  }

  get _mainAppDir() {
    const {taskbookDirectory} = config.get();
    const defaultAppDirectory = join(os.homedir(), '.taskbook');

    if (!taskbookDirectory) {
      return defaultAppDirectory;
    }

    if (!fs.existsSync(taskbookDirectory)) {
      render.invalidCustomAppDir(taskbookDirectory);
      process.exit(1);
    }

    return join(taskbookDirectory, '.taskbook');
  }

  _checkAndGetDynamoInstance() {
    const { dynamoBaseUrl, dynamoToken, dynamoNamespace } = config.get();
    if (!dynamoBaseUrl) {
      render.missingConfig('dynamoBaseUrl');
      process.exit(1);
    }

    if (!dynamoToken) {
      render.missingConfig('dynamoToken');
      process.exit(1);
    }

    if (!dynamoNamespace) {
      render.missingConfig('dynamoNamespace');
      process.exit(1);
    }

    return createInstance(dynamoBaseUrl, dynamoToken);
  }

  _ensureMainAppDir() {
    if (!fs.existsSync(this._mainAppDir)) {
      fs.mkdirSync(this._mainAppDir);
    }
  }

  _ensureStorageDir() {
    if (!fs.existsSync(this._storageDir)) {
      fs.mkdirSync(this._storageDir);
    }
  }

  _ensureTempDir() {
    if (!fs.existsSync(this._tempDir)) {
      fs.mkdirSync(this._tempDir);
    }
  }

  _ensureArchiveDir() {
    if (!fs.existsSync(this._archiveDir)) {
      fs.mkdirSync(this._archiveDir);
    }
  }

  _cleanTempDir() {
    const tempFiles = fs.readdirSync(this._tempDir).map(x => join(this._tempDir, x));

    if (tempFiles.length !== 0) {
      tempFiles.forEach(tempFile => fs.unlinkSync(tempFile));
    }
  }

  _ensureDirectories() {
    this._ensureMainAppDir();
    this._ensureStorageDir();
    this._ensureArchiveDir();
    this._ensureTempDir();
    this._cleanTempDir();
  }

  _getRandomHexString(length = 8) {
    return crypto.randomBytes(Math.ceil(length / 2)).toString('hex').slice(0, length);
  }

  _getTempFile(filePath) {
    const randomString = this._getRandomHexString();
    const tempFilename = basename(filePath).split('.').join(`.TEMP-${randomString}.`);
    return join(this._tempDir, tempFilename);
  }

  async _getFromDynamo() {
    const instance = this._checkAndGetDynamoInstance();
    const { dynamoNamespace } = config.get();
    try {
      let data = {};
      const res = await instance.get(`/api/${dynamoNamespace}/${this._mainStorageDynamoKey}`);
      if (res.data.value) {
        data = JSON.parse(res.data.value);
      }
      return data;
    } catch(err) {
      return {};
    }
  }

  async _setToDynamo(data) {
    const instance = this._checkAndGetDynamoInstance();
    const { dynamoNamespace } = config.get();
    try {
      await instance.put(`/api/${dynamoNamespace}/${this._mainStorageDynamoKey}`, data);
    } catch(err) {}
  }

  async get() {
    let data = {};

    const { useDynamo } = config.get();

    if (useDynamo) {
      data = await this._getFromDynamo();
    } else {
      if (fs.existsSync(this._mainStorageFile)) {
        const content = fs.readFileSync(this._mainStorageFile, 'utf8');
        data = JSON.parse(content);
      }
    }

    return data;
  }

  getArchive() {
    let archive = {};

    if (fs.existsSync(this._archiveFile)) {
      const content = fs.readFileSync(this._archiveFile, 'utf8');
      archive = JSON.parse(content);
    }

    return archive;
  }

  async set(data) {
    const { useDynamo } = config.get();

    if (useDynamo) {
      await this._setToDynamo(data);
    } else {
      data = JSON.stringify(data, null, 4);
      const tempStorageFile = this._getTempFile(this._mainStorageFile);

      fs.writeFileSync(tempStorageFile, data, 'utf8');
      fs.renameSync(tempStorageFile, this._mainStorageFile);
    }
  }

  setArchive(archive) {
    const data = JSON.stringify(archive, null, 4);
    const tempArchiveFile = this._getTempFile(this._archiveFile);

    fs.writeFileSync(tempArchiveFile, data, 'utf8');
    fs.renameSync(tempArchiveFile, this._archiveFile);
  }
}

module.exports = Storage;
