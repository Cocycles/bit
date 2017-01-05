/** @flow */
import * as pathLib from 'path';
import fs from 'fs';
import glob from 'glob';
import { merge } from 'ramda';
import { GlobalRemotes } from '../global-config';
import { Remotes, Remote } from '../remotes';
import { propogateUntil, currentDirName, pathHas, readFile, flatten } from '../utils';
import { getContents } from '../tar';
import { BIT_SOURCES_DIRNAME, BIT_HIDDEN_DIR, BIT_JSON, ENV_BITS_DIRNAME } from '../constants';
import { ScopeJson, getPath as getScopeJsonPath } from './scope-json';
import { ScopeNotFound, BitNotInScope } from './exceptions';
import { Source, Cache, Tmp, External } from './repositories';
import { DependencyMap, getPath as getDependenyMapPath } from './dependency-map';
import BitJson from '../bit-json';
import { BitId, BitIds } from '../bit-id';
import Bit from '../bit';
import indexer from '../search/indexer';
import { localSearch } from '../search';

const pathHasScope = pathHas([BIT_SOURCES_DIRNAME, BIT_HIDDEN_DIR]);

export type ScopeProps = {
  path: string,
  created?: boolean;
  cache?: Cache;
  tmp?: Tmp;
  sources?: Source,
  external?: External;
  dependencyMap?: DependencyMap;
  scopeJson?: ScopeJson;
};

function fromTar(name, tar) {
  return getContents(tar)
    .then((files) => {
      const bitJson = BitJson.fromPlainObject(JSON.parse(files[BIT_JSON]));
      return Bit.loadFromMemory({
        name,
        bitDir: name,
        bitJson,
        impl: bitJson.getImplBasename() ? files[bitJson.getImplBasename()] : undefined,
        spec: bitJson.getSpecBasename() ? files[bitJson.getSpecBasename()] : undefined
      });
    });
}

export default class Scope {
  external: External;
  created: boolean = false;
  cache: Cache;
  tmp: Tmp;
  sources: Source;
  path: string;
  dependencyMap: DependencyMap;

  constructor(scopeProps: ScopeProps) {
    this.path = scopeProps.path;
    this.scopeJson = scopeProps.scopeJson || new ScopeJson();
    this.cache = scopeProps.cache || new Cache(this);
    this.sources = scopeProps.sources || new Source(this);
    this.created = scopeProps.created || false;
    this.tmp = scopeProps.tmp || new Tmp(this);
    this.external = scopeProps.external || new External(this);
    this.dependencyMap = scopeProps.dependencyMap || new DependencyMap(this);
  }

  name() {
    return this.scopeJson.name;
  }

  remotes(): Promise<Remotes> {
    const self = this;
    function mergeRemotes(globalRemotes: GlobalRemotes) {
      const globalObj = globalRemotes.toPlainObject();
      return Remotes.load(merge(globalObj, self.scopeJson.remotes));
    }

    return GlobalRemotes.load()
      .then(mergeRemotes);
  }

  prepareBitRegistration(name: string, bitJson: BitJson) {
    try {
      bitJson.validate();
    } catch (e) {
      throw e;
    }
    
    return pathLib.join(this.tmp.getPath(), `${name}_${bitJson.version}.tar`);
  }

  describe() {
    return {
      name: this.name()
    };
  }

  put(bit: Bit) {
    bit.validateOrThrow();
    return this.remotes().then((remotes) => {
      return bit.dependencies()
        .fetch(this, remotes)
        .then((bits) => {
          this.external.store(bits);
          this.dependencyMap.setBit(bit, bits);
          return this.sources.setSource(bit)
            .then(() => bit.build())
            .then(() => this.dependencyMap.write())
            .then(() => bits.concat(bit));
            // .catch(() => bit.clear());
        });
    });
  }

  getExternal(bitId: BitId, remotes: Remotes): Promise<Bit[]> {
    const remote = bitId.getRemote(this, remotes);
    return remote.fetch([bitId])
      .then((tars) => {
        const bits = tars.map((tar) => {
          return fromTar(tar.name, tar.contents);
        });

        return Promise.all(bits);
      })
      .then((bits) => {
        return bits.map((bit) => {
          bit.scope = remote.alias;
          return bit;
        });
      });
  }

  get(bitId: BitId): Promise<Bit[]> {
    if (!bitId.isLocal()) {
      return this.remotes().then(remotes => this.getExternal(bitId, remotes));
    }
    
    bitId.version = this.sources.resolveVersion(bitId).toString();
    const dependencyList = this.dependencyMap.get(bitId);
    if (!dependencyList) throw new BitNotInScope();
    const remotes = this.dependencyMap.getRemotes(dependencyList);
    const bitIds = this.dependencyMap.getBitIds(dependencyList);
    
    return bitIds.fetch(this, remotes)
      .then((bits) => {
        return this.sources.loadSource(bitId)
          .then(bit => {
            return bits.concat(bit);
          });
      });
  }

  getOne(bitId: BitId): Promise<Bit> {
    return this.sources.loadSource(bitId);
  }

  push(bitId: BitId, remoteName: string) {
    return this.remotes().then((remotes) => {
      const remote = remotes.get(remoteName);
      return this.sources.loadSource(bitId)
        .then(bit => remote.push(bit))
        .then(() => this.sources.clean(bitId));
    });
  }

  search(remoteName: string, query: string) {
    return this.remotes().then((remotes) => {
      const remote = remotes.get(remoteName);
      return remote.search(query);
    });
  }

  searchLocally(query: string) {
    return localSearch.search(this.getPath(), query);
  }

  ensureDir() {
    return this.cache
      .ensureDir()
      .then(() => this.sources.ensureDir())
      .then(() => this.external.ensureDir())
      .then(() => this.tmp.ensureDir())
      .then(() => this.dependencyMap.write())
      .then(() => this.scopeJson.write(this.getPath()))
      .then(() => this); 
  }
  
  /**
   * list the bits in the sources directory
   **/
  listSources(): Promise<Bit[]> {
    return new Promise((resolve, reject) =>
      glob(pathLib.join('*', '*'), { cwd: this.sources.getPath() }, (err, files) => {
        if (err) reject(err);

        const bitsP = files.map(bitRawId =>
          this.getOne(BitId.parse(`@this/${bitRawId}`))
        );
        
        return Promise.all(bitsP)
        .then(resolve);
      })
    );
  }

  getMany(bitIds: BitIds) {
    return bitIds.map((bitId) => {
      return this.get(bitId);
    });
  }

  fetch(bitIds: BitIds): Promise<{id: string, contents: Buffer}[]> {
    return Promise.all(this.getMany(bitIds)).then((bits) => {
      const tars = flatten(bits).map((bit) => {
        return bit.toTar()
          .then((tar) => {
            return {
              id: bit.name,
              contents: tar
            };
          });
      });

      return Promise.all(tars);
    });
  }

  upload(name: string, tar: Buffer) {
    return getContents(tar)
      .then((files) => {
        const bitJson = BitJson.fromPlainObject(JSON.parse(files[BIT_JSON]));
        const bit = Bit.loadFromMemory({
          name,
          bitDir: name,
          bitJson,
          impl: bitJson.getImplBasename() ? files[bitJson.getImplBasename()] : undefined,
          spec: bitJson.getSpecBasename() ? files[bitJson.getSpecBasename()] : undefined
        });

        return this.put(bit)
        .then(bitResult => indexer.index(bitResult, this.getPath()));
      });
  }

  getPath() {
    return this.path;
  }

  hasEnvBit(bitId: BitId) {
    const box = bitId.box;
    const name = bitId.name;
    // const version = bitId.getVersion(); // @TODO - also involve the version
    // const scope = bitId.getRemote(); // @TODO - also involve the scope
    const bitPath = pathLib.join(this.getPath(), ENV_BITS_DIRNAME, box, name);
    return fs.existsSync(bitPath);
  }

  static create(path: string = process.cwd(), name: ?string) {
    if (pathHasScope(path)) return this.load(path);
    if (!name) name = currentDirName(); 
    const scopeJson = new ScopeJson({ name });
    return Promise.resolve(new Scope({ path, created: true, scopeJson }));
  }

  static load(absPath: string): Promise<Scope> {
    let scopePath = propogateUntil(absPath, pathHasScope);
    if (!scopePath) throw new ScopeNotFound();
    if (fs.existsSync(pathLib.join(scopePath, BIT_HIDDEN_DIR))) {
      scopePath = pathLib.join(scopePath, BIT_HIDDEN_DIR);
    }

    return Promise.all([
      readFile(getDependenyMapPath(scopePath)), 
      readFile(getScopeJsonPath(scopePath))
    ])
      .then(([rawDependencyMap, rawScopeJson]) => {
        const scopeJson = ScopeJson.loadFromJson(rawScopeJson.toString('utf8'));
        const scope = new Scope({ path: scopePath, scopeJson });
        scope.dependencyMap = DependencyMap.load(JSON.parse(rawDependencyMap.toString('utf8')), scope);
        return scope;
      });
  }
}
