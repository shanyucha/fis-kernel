/*
 * fis
 * http://web.baidu.com/
 */

'use strict';

function normalizeExt(ext){
    if(ext){
        var rExt = fis.config.get('roadmap.ext' + ext);
        if(rExt){
            ext = (rExt[0] === '.') ? rExt : ('.' + rExt);
        }
    }
    return ext;
}

function ensure(str){
    return str.replace(/[:*?"<>|,; ()&$]/g, '_');
}

function normalizePath(path, reg, rExt){
    return ensure(path.replace(reg, '')) + rExt;
}

function addHash(path, file){
    var rExt  = file.rExt,
        qRExt = fis.util.escapeReg(rExt),
        qExt = fis.util.escapeReg(file.ext),
        hash = file.getHash(),
        reg = new RegExp(qRExt + '$|' + qExt + '$', 'i');
    return path.replace(reg, '') + '_' + hash + rExt;
}

function getDomainsByPath(path){
    var domain = fis.config.get('roadmap.domain', {}), value = '';
    if(typeof domain === 'string'){
        value = domain;
    } else {
        fis.util.map(domain, function(pattern, domain){
            if(pattern === 'image' && fis.util.isImageFile(path)){
                value = domain;
                return true;
            } else if(fis.util.glob(pattern, path)){
                value = domain;
                return true;
            }
        });
    }
    return value.split(/\s*,\s*/);
}


function getDomain(file){
    var path = file.subpath,
        hash = fis.util.md5(path),
        domains = getDomainsByPath(path),
        len = domains.length,
        domain = '';
    if(len){
        domain = domains[hash.charCodeAt(0) % len];
    }
    return domain;
}

var File = Object.derive(function(){
    var _ = fis.util,
        info = _.pathinfo(arguments);
    _.map(info, this, true);
    var ext = info.ext,
        rExt = this.rExt = normalizeExt(ext),
        realpath = this.realpath = _.realpathSafe(info.fullname),
        realpathNoExt = this.realpathNoExt = info.rest,
        root = fis.project.getProjectPath();
    
    this.useDomain = this.useHash = rExt === '.js' || rExt === '.css' || _.isImageFile(rExt);
    this.isMod = false;
    this.requires = [];
    
    if(realpath.indexOf(root) === 0){
        //subpath
        var len = root.length, subpath;
        this.subpath = subpath = realpath.substring(len);
        this.subdirname = info.dirname.substring(len);
        this.subpathNoExt = realpathNoExt.substring(len);
        
        //roadmap
        fis.uri.roadmap(subpath, 'path', this);
        
        if(this.release === false){
            var self = this;
            Object.defineProperty(this, 'url', {
                enumerable : true,
                get : function(){
                    fis.log.error('unreleasable file [' + self.realpath + ']');
                }
            });
        } else {
            //release & url
            var reg = new RegExp(_.escapeReg(ext) + '$|' + _.escapeReg(rExt) + '$', 'i');
            this.release = normalizePath(this.release || this.subpath, reg, rExt);
            this.url = normalizePath(this.url || this.release, reg, rExt);
        }
        
        if(this.useDomain){
            var domain = this.domain || getDomain(this);
            this.domain = domain.replace(/\\/g, '/').replace(/\/+$/, '');
        } else {
            this.domain = '';
        }
        
        //file id
        var id = this.id || subpath.replace(/^\//, ''),
            ns = fis.config.get('namespace');
        if(ns) {
            id = ns + ':' + id;
        }
        this.id = id;
    }
}, {
    exists : function(){
        return fis.util.exists(this.realpath);
    },
    isText : function(){
        return fis.util.isTextFile(this.realpath);
    },
    isImage : function(){
        return fis.util.isImageFile(this.realpath);
    },
    toString : function(){
        return this.realpath;
    },
    getMtime : function(){
        return fis.util.mtime(this.realpath);
    },
    isFile : function(){
        return fis.util.isFile(this.realpath);
    },
    isDir : function(){
        return fis.util.isDir(this.realpath);
    },
    setContent : function(c){
        this._content = c;
        return this;
    },
    getContent : function(){
        if(typeof this._content === 'undefined'){
            this._content = fis.util.read(this.realpath);
        }
        return this._content;
    },
    getHash : function(){
        if(typeof this._hash === 'undefined'){
            this._hash = fis.util.md5(this.getContent());
        }
        return this._hash;
    },
    getBase64 : function(prefix){
        prefix = typeof prefix === 'undefined' ? true : prefix;
        if(prefix){
            prefix = 'data:' + fis.util.getMimeType(this.rExt) + ';base64,';
        } else {
            prefix = '';
        }
        return prefix + fis.util.base64(this._content);
    },
    writeTo : function(target){
        var charset = this.isText() ? fis.config.get('project.charset', 'utf-8') : null;
        fis.util.write(target, this._content, charset);
        return this;
    },
    getId : function(){
        return this.id;
    },
    getUrl : function(withHash, withDomain){
        var url = this.url;
        if(withHash && this.useHash){
            url = addHash(url, this);
        }
        if(withDomain && this.useDomain){
            url = this.domain + url;
        }
        return url + this.query;
    },
    getHashRelease : function(){
        if(this.release){
            if(this.useHash){
                return addHash(this.release, this);
            } else {
                return this.release;
            }
        } else {
            fis.log.error('unreleasable file [' + this.realpath + ']');
        }
    },
    addRequire : function(id){
        if(id && (id = id.trim())){
            if(this.requires.indexOf(id) < 0){
                this.requires.push(id);
            }
            return id;
        }
        return false;
    },
    addSameNameRequire : function(ext){
        var path;
        if(fis.util.isFile(this.realpathNoExt + ext)){
            path = './' + this.filename + ext;
        } else {
            var map = fis.config.get('roadmap.ext');
            for(var key in map){
                if(map.hasOwnProperty(key)){
                    var rExt = map[key];
                    if(rExt === ext && fis.util.isFile(this.realpathNoExt + rExt)) {
                        path = './' + this.filename + rExt;
                        break;
                    }
                }
            }
        }
        if(path){
            var info = fis.uri.getId(path, this.dirname);
            this.addRequire(info.id);
        }
    },
    removeRequire : function(id){
        var pos = this.requires.indexOf(id);
        if(pos > -1){
            this.requires.splice(pos, 1);
        }
    },
    deliver : function(output, md5){
        var release = this.release;
        if(!release){
            fis.log.error('unable to get release path of file['
                + this.realpath
                + ']: Maybe this file is neither in current project or releasable');
        }
        if(fis.util.exists(output) && !fis.util.isDir(output)){
            fis.log.error('unable to deliver file['
                + this.realpath + '] to dir['
                + output + ']: invalid output dir.');
        }
        this.delivered = [];
        var target;
        if(md5 == 0 || !this.useHash){
            target = fis.util(output, release);
            this.writeTo(target);
            this.delivered.push(target);
        } else if(md5 == 1){
            target = fis.util(output, this.getHashRelease());
            this.writeTo(target);
            this.delivered.push(target);
        } else {
            target = fis.util(output, release);
            this.writeTo(target);
            this.delivered.push(target);
            
            target = fis.util(output, this.getHashRelease());
            this.writeTo(target);
            this.delivered.push(target);
        }
        return this;
    }
});

module.exports = File.factory();
module.exports.wrap = function(file){
    if(typeof file === 'string'){
        return new File(file);
    } else if(file instanceof File){
        return file;
    } else {
        fis.log.error('unable to convert [' + (typeof file) + '] to [File] object.');
    }
};