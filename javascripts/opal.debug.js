var opal = {};
(function(global, exports) {
/* 
 * vienna.js
 * vienna
 * 
 * Created by Adam Beynon.
 * Copyright 2010 Adam Beynon.
 *
 * Permission is hereby granted, free of charge, to any person obtaining a copy
 * of this software and associated documentation files (the "Software"), to deal
 * in the Software without restriction, including without limitation the rights
 * to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
 * copies of the Software, and to permit persons to whom the Software is
 * furnished to do so, subject to the following conditions:
 * 
 * The above copyright notice and this permission notice shall be included in
 * all copies or substantial portions of the Software.
 * 
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
 * FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
 * AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
 * LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
 * OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
 * THE SOFTWARE.
 */
 
 
// lets just do this straight away, out of the way. Still need a way to log from
// IE, Opera etc etc etc
if (typeof console === 'undefined') {
  global.console = {} ;
  // console.info = console.warn = console.error = console.log = function(){};
}

// Core classes
// exports.c_object        = null;
var class_basic_object  = null,
    class_module        = null,
    class_class         = null,
    class_object        = null,
    module_kernel       = null,
    class_symbol        = null,
    class_true_class    = null,
    class_false_class   = null,
    class_nil_class     = null,
    class_proc          = null,
    class_string        = null,
    class_array         = null,
    class_hash          = null,
    class_number        = null,
    class_regexp        = null,
    class_range         = null,
    class_exception     = null;

// top self
exports.top_self        = null;

// Core object literals (in main window scope)
global.vnNil            = null;
global.vnTrue           = null;
global.vnFalse          = null;

// flags for object/class types
var T_CLASS             = 1,
    T_MODULE            = 2,  
    T_OBJECT            = 4,  
    T_BOOLEAN           = 8, 
    T_STRING            = 16,  
    T_ARRAY             = 32,  
    T_NUMBER            = 64, 
    T_PROC              = 128,  
    T_SYMBOL            = 256,  
    T_HASH              = 512,
    T_RANGE             = 1024, 
    T_ICLASS            = 2048,
    FL_SINGLETON        = 4096;


// create a ruby proc from javascript func



// hash from arguments vnH(key1, val1, key2, val2...)
global.vnH = function() {
  var k, v, res = new class_hash.allocator();
  res.__keys__ = [];
  res.__assocs__ = {};
  res.__default__ = vnNil;
  for (var i = 0; i < arguments.length; i++) {
    k = arguments[i], v = arguments[i+1];
    i++;
    res.__keys__.push(k);
    res.__assocs__[k.hash()] = v;
  }
  return res;
};

// Regexp
global.vnR = function(reg) {
  var res = new class_regexp.allocator();
  res.__reg__ = reg;
  return res;
};

var symbol_table = { };

// For object_id's .. each object/class will get an object_id
var hash_yield = 0;

var yield_hash = function() {
  return hash_yield++;
};

if (!Array.prototype.indexOf) {
  Array.prototype.indexOf = function (obj) {
   for (var i = 0; i< this.length; i++) {
     if (this[i] == obj) return i;
   }
   return -1;
 };
};

// EntryPoint. Every time something causes ruby to be run, it must be done
// through this function. This includes events, timers firing and the initial
// main() code. This will capture possible errors and log them and their stack
// trace to the terminal.
// 
// @param [Function] func to run as main entry point
// @return [Object] returns the result of the function
// 
exports.entry_point = function(func) {
  return func();
};

// Base of every object or class object in vienna. Every object, string, number,
// class, module, regexp, proc etc will be an instance of this, so const_set etc
// are all on the prototype of this. This keeps a lot from needing to go into
// global namespace, and keeps vienna export nice and clean.
// 
// Update/Renaming scheme
// ======================
// 
// We are now going to use the native String/Number/Array prototypes, so we need
// to make sure we avoid clashes. All ruby methods start with $, so all
// definitions/usage functions will end with $. No
// generated methods can end with $, so we avoid clashes. For example, the 
// methods/properties above become...
// 
// .t$ - true literal
// .f$ - false literal
// .n$ - nil literal
// 
// .r$ - ruby truthiness
// 
// .h$() - make hash from args
// .y$() - make symbol if not already exists
// 
// .a$() - and test, takes a function as single param to make test
// .o$() - or test, takes a function as single param to make test
// 
// .O$ - T_OBJECT
// .C$ - T_CLASS
// .M$ - T_MODULE
// .A$ - T_ARRAY
// 
// .dc$() - define class
// .dm$() - define method
// 
var __boot_base_class = function() {
  this.id = yield_hash();
};

__boot_base_class.prototype.hash = function() {
  return this.id;
};

// convert ruby id to jsid - for methods
__boot_base_class.prototype.mid2jsid = function(mid) {
  return ("$" + mid).replace(/=/g, '$e').replace(/\?/g, '$q');
};


__boot_base_class.prototype.define_class = function(sup, id, body, flag) {
  
  var klass, base = this;
  
  if (base.flags & T_OBJECT)
    base = base.isa;
  
  switch (flag) {
    // normal class
    case 0:
      if (sup === vnNil)
        sup = class_object;
      
      klass = define_class_under(base, id, sup);
      break;
    case 1:
      // throw "running class shift for " + id.class_name
      klass = id.singleton_class();
      // return;
      break;
    case 2:
      klass = define_module_under(base, id);
      break;
    default:
      throw "define_class: unknown flag: " + flag
  }
  
  return body.apply(klass);
  
  // return klass;
};

// get singleton class
__boot_base_class.prototype.singleton_class = function() {
  var klass;
  
  // if (this.info & )
  
  if (this.info & FL_SINGLETON) {
    klass = this.isa;
  }
  else {
    // if we a re a class or module..
    if ((this.info & T_CLASS) || (this.info & T_MODULE)) {
      // if we have an __attached__, use it
      if (this.__attached__) {
        return this.__attached__;
      }
      // otherwise, create it
      else {
        var meta = __subclass(this.class_name, this.isa);
        meta.info = meta.info | FL_SINGLETON;
        this.__attached__ = this.isa = meta;
        meta.__attached__ = this;
        return meta;
      }
    }
    else {
      // object
      // console.log("need to make singleton class for: " + this.class_name);
      
      this.info = this.info | FL_SINGLETON;
      var meta = __subclass(this.class_name, this.isa);
      meta.info = meta.info | T_ICLASS;
      var old_super = this.isa;
      klass = this.isa = meta;
      meta.__instance__ = this;
      meta.constants = old_super.constants;
      // klass = this.isa;
      // var class_name = this.isa.class_name;
      // klass = make_metaclass(this, this.isa);
    }
    
  }
  
  return klass;
};

__boot_base_class.prototype.dm = function(m_id, body, singleton) {
  // console.log(m_id + " for ");
  // console.log(this.class_name);
  
  // hack for replacing mid_to_jsid
  var js_id = '$' + m_id;
  
  body.method_id = m_id;
  body.jsid = js_id;
  body.displayName = m_id;
  // register self as the current class for body (for super calls)
  body.opal_class = this;
  
  if (singleton) {
    if ((this.info & T_CLASS) || (this.info & T_MODULE)) {
      this.constructor.prototype[js_id] = body;
      this.constructor.prototype.method_table[js_id] = body;
    }
    else {
      // add method to singleton_object
      this[js_id] = body;
      // throw "need to add_method to singleton object"
    }
  }
  else {
    if ((this.info & T_CLASS) || (this.info & T_MODULE)) {
      if (this.info & FL_SINGLETON) {
        // console.log("need to define method for singleton.. " + m_id);
        this.__attached__.constructor.prototype[js_id] = body;
        this.__attached__.constructor.prototype.method_table[js_id] = body;
      }
      else {
        this.allocator.prototype[js_id] = body;
        this.allocator.prototype.method_table[js_id] = body;
      }
      
      if (this.info & T_ICLASS) {
        this.__instance__[js_id] = body;
        console.log("adding method " + m_id + " which is " + js_id);
        // console.log(this.__instance__);
      }
    }
    else {
      // console.log("need to make into singleton object for: " + this.$inspect() + " with method " + m_id);
      var cls = this.singleton_class();
      cls.allocator.prototype[js_id] = body;
      cls.allocator.prototype.method_table[js_id] = body;
      // i_class singleton will only ever have one instance: this.
      // cls.__instance__ = this;
      body.opal_class = cls;
      // cls.dm(m_id, body, singleton);
      // add method to singleton object
      this[js_id] = body;
      // console.log(this);
      // throw "need to add_method to  object " + m_id
    }
  }
  return this.n;
};

__boot_base_class.prototype.const_set = function(id, val) {
  
  var base = this;
  
  if (base.info & T_OBJECT)
    base = base.isa;

  base.constants[id] = val;
  return val;
};

__boot_base_class.prototype.const_defined = function(id) {
  var base = this;
  
  if (base.info & T_OBJECT)
    base = base.isa;
    
  if (base.constants[id])
    return true;
    
  return false;
};

__boot_base_class.prototype.const_get = function(id) {
  
  var base = this;
  
  if (base.info & T_OBJECT)
    base = base.isa;
    
  if (base.constants[id])
    return base.constants[id];
    
  // need to go up through hierarchy
  var search = base.opal_parent, res;
  while (search) {
    res = search.const_get(id);
    if (res) {
      return res;
    }
    search = search.opal_parent;
  }
  // console.log("my parent is:");
  // console.log(base.opal_parent);
  // console.log(base.opal_parent.constants.Reporter);
  
  throw { toString: function() {
    return "NameError: uninitialized constant: " + id;
  }};
};

// ivar get
__boot_base_class.prototype.ig = function(id) {
  if (this.hasOwnProperty(id))
    return this[id];
  
  return vnNil;
};

// ivar set
__boot_base_class.prototype.is = function(id, val) {
  return this[id] = val;
};

__boot_base_class.prototype.include = function(module) {
  
  if (!this.included_modules)
    this.included_modules = [];
  
  if (this.included_modules.indexOf(module) != -1)
    return; // already included
  
  this.included_modules.push(module);
  module.included_in.push(this);
  
  // add each method from module into class's prototype
  for (method in module.allocator.prototype.method_table) {
    // if (!this.allocator.prototype.method_table[method])
    // if (!this.allocator.prototype.hasOwnProperty(method))
    this.allocator.prototype.method_table[method] = module.allocator.prototype.method_table[method];
    this.allocator.prototype[method] = module.allocator.prototype.method_table[method];
  }
  
  // console.log("checking include constants from " + module.class_name + " into " + this.class_name);
  for (var prop in module.constants) {
    if (module.constants.hasOwnProperty(prop) && !this.constants[prop]) {
      this.constants[prop] = module.constants[prop];
    }
  }
};

__boot_base_class.prototype.extend = function(module) {
  // add each method from module into class's prototype
  for (method in module.allocator.prototype.method_table) {
    // console.log("adding " +method);
    this.constructor.prototype.method_table[method] = module.allocator.prototype.method_table[method];
    this.constructor.prototype[method] = module.allocator.prototype.method_table[method];
  }
};

// RTEST - true. false and nil override this
__boot_base_class.prototype.r = true;

// ANDTEST
__boot_base_class.prototype.a = function(lhs, rhs) {
  if (lhs.r)
    return rhs.apply(this);
  
  return lhs;
};

// ORTEST
__boot_base_class.prototype.o = function(lhs, rhs) {
  if (lhs.r)
    return lhs;
  
  return rhs.apply(this);
};

// Handle yielding
// 
// @param {Function} proc to yield
// @param {Array} params to yield to proc
// 
__boot_base_class.prototype.rbYield = function(proc, params) {
  // if we tried to yield, and we were not given a block..
  if (!proc) {
    throw {
      toString: function() {
        return "Yield: no block given";
      }
    };
  }
  
  // otherwise, yield it in the 'self' context it was created in.
  return proc.apply(proc.__self__, params);
};

// Handle while loops.
// 
// @param {Function} expression wrapped in function to evaluate before each pass
// @param {Function} body wrapped in function to evaluate as eash pass
// @param {Boolean} should_redo - call the body once without reevaluating the
//        expression. This allows for 'redo' support. Default is false, we set
//        it to true ourselves by repplaying() the method.
// 
// Example
// 
//    while true
//      puts 10
//    end
// 
//    self.rbWhile(function() {
//      return self.t;
//    }), function() {
//      self.puts(10);
// };
// })
__boot_base_class.prototype.rbWhile = function(expression, body, should_redo) {
  try {
    // are we in a redo()? if so, apply body once first, then carry on
    if (should_redo) {
      body.apply(this);
    }
    
    while (expression.apply(this)) {
      body.apply(this);
    }
    // while_loop.apply(this);
    // default return nil if everything was ok
    return this.n;
  } catch (e) {
    // try and catch a break statement
    if (e.__keyword__ ==  'break') {
      return e.opal_value || this.n;
    }
    
    // testing next.. this might not work too well...
    if (e.__keyword__ == 'next') {
      return arguments.callee.apply(this, [expression, body]);
    }
    
    if (e.__keyword__ == 'redo') {
      return arguments.callee.apply(this, [expression, body, true]);
    }
    
    // anything else, rethrow
    throw e;
  };
};

// redo keyword - no args ever
__boot_base_class.prototype.rbRedo = function() {
  throw {
    toString: function() {
      return "uncaught redo";
    },
    __keyword__: 'redo'
  };
};

// break keyword (with possible args?)
__boot_base_class.prototype.rbBreak = function(value) {
  throw {
    toString: function() {
      return "uncaught break";
    },
    __keyword__: 'break',
    opal_value: value == undefined ? this.n : value
  };
};

// next keyword
__boot_base_class.prototype.rbNext = function(value) {
  throw {
    toString: function() {
      return "uncaught next";
    },
    __keyword__: 'next',
    opal_value: value || this.n
  };
};

// return keyword (only within a block) with args..
__boot_base_class.prototype.rbReturn = function(value) {
  throw  {
    toString: function() {
      return "uncaught rbReturn";
    },
    __keyword__: 'return',
    opal_value: value || this.n
  };
};

// ruby proc from function
// 
// A proc/block/llambda are simply javascript functions. Everytime a block is
// created in ruby, its current self, as in the self which the block should use
// for evaluating, is stored by the function onto the property .__self__, so 
// that whenever the block is call()'d or yield()'d, it is apply()'d using this
// self so that it evaluates in that given context. To evaluate the block in
// another context, with, for exampke, instance_eval, we just apply() with our
// own custom self. We never need to replace __self__, we just apply uysing a
// different context.
// 
// @param {Function} fun - the block implementation
__boot_base_class.prototype.P = function(fun) {
  fun.__self__ = this;
  return fun;
  // var res = new class_proc.allocator();
  // res.__fun__ = fun;
  // return res;
};

// same as above, but lambda
__boot_base_class.prototype.L = function(fun) {
  fun.__self__ = this;
  fun.__lambda__ = true;
  return fun;
};

// create a ruby symbol from javascript str. This checks the global sym table
// first to make sure we only create one symbol per name (id).
__boot_base_class.prototype.Y = function(str) {
  if (symbol_table.hasOwnProperty(str))
    return symbol_table[str];
    
  var res = new class_symbol.allocator();
  res.__ptr__ = str;
  symbol_table[str] = res;
  return res;
};

// ruby range
__boot_base_class.prototype.R = function(start, end, exclusive) {
  var res = new class_range.allocator();
  res.__start__ = start;
  res.__end__ = end;
  res.__exclusive__ = exclusive;
  res.__real_end__ = exclusive ? end - 1 : end;
  return res; 
};

// calling super
// 
// @param {Function} func of current func calling super
// @param {Array} args to pass to super implementation
// @return {Object} return value from super call
// 
// CURRENTLY ONLY SUPPORTS INSTANCE CLASSES
// 
__boot_base_class.prototype.opal_super = function(func, args) {
  // get current imp's implementation
  var cur_class = func.opal_class;
  // for super, we just need the imp of the superclass's method. This will work
  // up the chain as opal_class is set to the class on which the method was
  // defines, so any method put in as a super class to this will have our super
  // method.
  var sup_class = cur_class.super_class;
  
  if (!sup_class) {
    throw "NativeError: no super class found from " + cur_class
  }
  
  var sup_func = sup_class.allocator.prototype[func.jsid];
  
  if (!sup_func) {
    throw "NativeError: no superclass method found for " + func.method_id;
  }
  
  // console.log("ok, going to call it");
  // console.log(sup_func);
  // console.log(args);
  // if all ok, call it
  var res = sup_func.apply(this, args);
  // console.log("res is:");
  // console.log(res);
  return res;
};

// ruby error from native error
__boot_base_class.prototype.rbNativeError = function(err) {
  var res = class_exception.$new();
  res.is('@message', err.toString());
  return res;
};

__boot_base_class.prototype.TN = T_NUMBER;
__boot_base_class.prototype.TS = T_STRING;
__boot_base_class.prototype.TP = T_PROC;
__boot_base_class.prototype.TA = T_ARRAY;
__boot_base_class.prototype.TH = T_HASH;

var define_class_under = function(base, id, super_class) {
  
  if (base.const_defined(id))
    return base.const_get(id);
  
  if (!super_class)
    super_class = class_object;
  
  var res = __subclass(id, super_class);
  // parent relationship
  res.constructor.prototype.opal_parent = base;
  base.const_set(id, res);
  return res;
};

// Define a toll-free bridged ruby class. This is used for mixing native JS
// strings, arrays etc with ruby versions.
// 
// Usage
// =====
// 
//    class_string = define_bridged_class("String", String);
// 
// This uses the String constructor. For now, every toll free will inherit from
// object, and will be set as a constant in the Object:: namespace
// 
var define_bridged_class = function(id, native_class) {
  var res = __subclass(id, class_object);
  
  var old_allocator = res.allocator.prototype;
  res.allocator = native_class;
  
  for (var prop in old_allocator) {
    native_class.prototype[prop] = old_allocator[prop];
  }
  
  class_object.const_set(id, res);
  return res;
};

var __subclass = exports.__subclass = function(id, super_class) {
  var cls = function() {
    this.id = yield_hash();
  };
  
  cls.prototype = new super_class.allocator();
  cls.prototype.method_table = {};
  cls.prototype.constructor = cls;
  cls.prototype.class_name = id;
  cls.prototype.super_class = super_class;
  cls.prototype.info = T_OBJECT;
  
  var meta = function() {
    this.id = yield_hash();
  }
  
  meta.prototype = new super_class.constructor();
  meta.prototype.method_table = {};
  meta.prototype.allocator = cls;
  meta.prototype.class_name = id;
  meta.prototype.super_class = super_class;
  meta.prototype.info = T_CLASS;
  meta.prototype.constructor = meta;
  
  // constants
  meta.prototype.constants = new super_class.constants_alloc();
  meta.prototype.constants_alloc = function() {};
  meta.prototype.constants_alloc.prototype = meta.prototype.constants;
  
  var res = new meta();
  cls.prototype.isa = res;
  return res;
}

var define_module_under = function(base, id) {
  
  if (base.const_defined(id))
    return base.const_get(id);
    
  var mod = define_class_under(base, id, class_module);
  mod.included_in = [];
  mod.info = T_MODULE;
  mod.allocator.prototype.info = T_MODULE;
  return mod;
};

var __boot_defclass = function(id, super_class) {
  
  var cls = function() {
    this.id = yield_hash();
  };
  
  if (super_class)
    cls.prototype = new super_class();
  else
    cls.prototype = new __boot_base_class();
  
  cls.prototype.method_table = {};
  cls.prototype.constructor = cls;
  cls.prototype.class_name = id;
  cls.prototype.super_class = super_class;
  cls.prototype.info = T_OBJECT;
  return cls;
};

var __boot_makemeta = function(klass, super_class) {
  
  var meta = function() {
    this.id = yield_hash();
  };
  
  meta.prototype = new super_class();
  
  meta.prototype.included_in = [];
  meta.prototype.method_table = {};
  meta.prototype.allocator = klass;
  meta.prototype.constructor = meta;
  meta.prototype.class_name = klass.prototype.class_name;
  meta.prototype.super_class = super_class;
  meta.prototype.info = T_CLASS;
  
  // constants etc
  if (klass === boot_basic_object) {
    meta.prototype.constants_alloc = function() {};
    meta.prototype.constants = meta.prototype.constants_alloc.prototype;
  } else {
    meta.prototype.constants = new super_class.prototype.constants_alloc();
    meta.prototype.constants_alloc = function() {};
    meta.prototype.constants_alloc.prototype = meta.prototype.constants;
  }
  
  var res = new meta();
  klass.prototype.isa = res;
  return res;
};

var __boot_defmetameta = function(klass, meta) {
  klass.isa = meta;
};

// ==============
// = Initialize =
// ==============

var metaclass;

var boot_basic_object = __boot_defclass("BasicObject", null);
var boot_object = __boot_defclass("Object", boot_basic_object);
var boot_module = __boot_defclass("Module", boot_object);
var boot_class = __boot_defclass("Class", boot_module);

class_basic_object = __boot_makemeta(boot_basic_object, boot_class);
class_object = __boot_makemeta(boot_object, class_basic_object.constructor);
class_module = __boot_makemeta(boot_module, class_object.constructor);
class_class = __boot_makemeta(boot_class, class_module.constructor);

__boot_defmetameta(class_basic_object, class_class);
__boot_defmetameta(class_object, class_class);
__boot_defmetameta(class_module, class_class);
__boot_defmetameta(class_class, class_class);

class_object.const_set("BasicObject", class_basic_object);
class_object.const_set("Object", class_object);
class_object.const_set("Class", class_class);
class_object.const_set("Module", class_module);

// Custom methods for modules to handle includes properly
class_module.constructor.prototype.dm = function(m_id, body, sing){
    
  js_id = '$' + m_id;  
  
  // super
  __boot_base_class.prototype.dm.apply(this, arguments);
    
  // go through each class we are included in and add new method to that as well
  for (var i = 0; i < this.included_in.length; i++) {
    this.included_in[i].allocator.prototype[js_id] = body;
  }
};

// and then fix again for class
class_class.constructor.prototype.dm = class_object.constructor.prototype.dm;


exports.Object = class_object;
exports.top_self = new class_object.allocator();

// Override Object.include so that we can also include each module into our
// Natives String, Array, Number etc.
class_object.include = function(module) {
  // super
  var res = __boot_base_class.prototype.include.apply(class_object, [module]);
    
  var natives = [class_string, class_number, class_array, class_regexp];
  
  // return res;
  for (var i = 0; i < natives.length; i++) {
    natives[i].include(module);
  }
  
  return res;
};

// When we define a method on object itself, we need to also set it on our 
// natives.
class_object.dm = function() {
  // super
  var res = __boot_base_class.prototype.dm.apply(class_object, arguments);
  
  var natives = [class_string, class_number, class_array, class_regexp];
  
  // return res;
  for (var i = 0; i < natives.length; i++) {
    natives[i].dm.apply(natives[i], arguments);
  }
  
  return res;
};

// Proc class
// class_proc = define_class_under(class_object, "Proc", class_object);
// class_proc.allocator.prototype.info = T_OBJECT | T_PROC;

class_proc = define_bridged_class("Proc", Function);
class_proc.allocator.prototype.info = T_OBJECT | T_PROC;
// Fix for Object's super_class being a proc and causing inifite recusrion in
// super class chain Object->Proc->Object...etc
class_object.allocator.prototype.super_class = undefined;
class_object.super_class = undefined;

// Range class
class_range = define_class_under(class_object, "Range", class_object);
class_range.allocator.prototype.info = T_OBJECT | T_RANGE;

// True class
class_true_class = define_class_under(class_object, "TrueClass", class_object);
vnTrue = new class_true_class.allocator();
vnTrue.info = vnTrue.info | FL_SINGLETON;
__boot_base_class.prototype.t = vnTrue;

// False class
class_false_class = define_class_under(class_object, "FalseClass",class_object);
vnFalse = new class_false_class.allocator();
vnFalse.info = vnFalse.info | FL_SINGLETON;
__boot_base_class.prototype.f = vnFalse;

vnFalse.r = false;

// Nil class
class_nil_class = define_class_under(class_object, "NilClass", class_object);
vnNil = new class_nil_class.allocator();
vnNil.info = vnNil.info | FL_SINGLETON;
__boot_base_class.prototype.n = vnNil;

vnNil.r = false;

// Hash
class_hash = define_class_under(class_object, "Hash", class_object);
class_hash.allocator.prototype.info = T_OBJECT | T_HASH;

class_hash.allocator.prototype.hash_store = function(key, value) {
  var hash = key.hash();
  // if we dont have the hashed key, add it
  if (!this.__assocs__.hasOwnProperty(hash)) {
    this.__keys__.push(key);
  }
  // then in both cases reset the assoc
  return this.__assocs__[hash] = value;
};

class_hash.allocator.prototype.hash_delete = function(key) {
  var hash = key.hash();
  
  if (this.__assocs__[hash]) {
    var ret = this.__assocs__[hash];
    delete this.__assocs__[hash];
    this.__keys__.splice(this.__keys__.indexOf(key), 1);
    return ret;
  }
  
  return this.__default__;
};

class_hash.allocator.prototype.hash_fetch = function(key) {
  var hash = key.hash();
  
  if (this.__assocs__.hasOwnProperty(hash))
    return this.__assocs__[hash];
  
  // default return nil (should be overrideable)
  return this.__default__;
};

// Symbol class
class_symbol = define_class_under(class_object, "Symbol", class_object);

class_symbol.allocator.prototype.toString = function() {
  return ":" + this.__ptr__;
};

// Regexp
class_regexp = define_class_under(class_object, "Regexp", class_object);


// Exceptions
class_exception = define_class_under(class_object, "Exception", class_object);

class_exception.allocator.prototype.toString = function() {
  var message = this.ig('@message');
  if (message && message.r)
    return this.class_name + ": " + this.ig('@message').toString();
  
  return this.class_name;
};

class_exception.allocator.prototype.raise = function() {
  // console.log(this);
  throw this;
};

// Special Classes: We do these three (Array, String, Number) last so that we
// have all our special runtime methods setup so we can add them to 
// Array.prototype, String.prototype and Number.prototype. Note: we could also
// do RegExp....?

// Number class
class_number = define_bridged_class("Number", Number);
class_number.allocator.prototype.info = T_OBJECT | T_NUMBER;
 
class_number.allocator.prototype.hash = function() {
  return '$$num$$' + this;
};


// String class
class_string = define_bridged_class("String", String);
class_string.allocator.prototype.info = T_OBJECT | T_STRING;

class_string.allocator.prototype.hash = function() {
  return this;
};


// Array class
class_array = define_bridged_class("Array", Array);
class_array.allocator.prototype.info = T_OBJECT | T_ARRAY;

// Regexp class
class_regexp = define_bridged_class("Regexp", RegExp);
class_regexp.allocator.prototype.info = T_OBJECT;


// Kernel module
module_kernel = define_module_under(class_object, "Kernel");
class_object.include(module_kernel);

// All methods in here are just for the browser. This file will not be loaded
// by the "server side" opal tool. A lot of methods defined here need to have
// duplicate definitions for use by the server side tool.

// =======================
// = Opal loading system =
// =======================

// "Opals" are similar to gems in vanilla ruby. An opal is like a framework of
// code and other resources.

// Register an opal with the given specification, which is a json literal with
// name, description, dependencies etc.
// 
// Example
// =======
// 
// opal.register({
//  name: "browser",
//  version: "0.1.0",
//  files: {
//    "bin/browser", function() { ... bin imp ... },
//    "lib/browser.rb": function() { ... browser.rb imp ... },
//    "lib/browser/element.rb": function() { ... element.rb imp ... }
//  }
// });
// 
// Notes
// =====
// 
// We then add the lib/ path in browser to our load path, so require('browser')
// will load lib/browser.rb, and require('browser/element') will load
// lib/browser/element.rb
// 
// All opals are stores with their name as a prefix, so lib/browser.rb as above
// will actually have a full path url of "/browser/lib/browser.rb"
// 
// Applications are initialized by calling their "bin" file, which by default is
// named identically to their opal name, so to start our "sample_controls"
// application, we initialize "/sample_controls/bin/sample_controls" which will
// probably require "/sample_controls/lib/sample_controls.rb" which will itself
// load cherry_kit etc etc. the main bin file most often than not will simply
// call something like CKApplication.start()
// 
// Resources like css could be added here, as well as auto loading for them, so
// when the main lib file is loaded, then they are automatically required.. 
// might work.
// 
// require('browser') will first search all opals, so we can carry out potential
// autoloading of css etc
// 
exports.register = function(specification) {
  // console.log("registering new opal: " + specification.name);
  opal_list[specification.name] = specification;
  
  load_paths.push(specification.name + "/lib/");
  
  for (var file_name in specification.files) {
    file_list[specification.name + "/" + file_name] = specification.files[file_name];
  }
};

// same as above but register this as the default application sequence. will
// look in this opal for a bin file with same name to be used for running
// exports.register_application = function(specification) {
//   exports.register(specification);
//   bin_file = '/' + specification.name + '/bin/' + specification.name;
// };

// array of loadpaths used in "require" .. each opal listed etc
// by default has root of filesystem, but each added opal also adds its libpath
var load_paths = [""];

// to load on window.load
var bin_file = null;

// cwd for application
var opal_cwd = null;

// list of all opals: name to specification json object
var opal_list = {};

// dictionary of all files:
// 
// /path/to_file.1: function() { ... imp ... },
// /path/to_file.2: function() { ... imp ... }
// 
// If a file has been included, then its function will be marked with an 
// property ".opal_required" and set to true
var file_list = exports.files = {};

// =======================================================
// = Temp launching - should be done via window.onload.. =
// =======================================================
// Run is our main file to run. usually app path, sometimes spec path etc
// 
// @param [String] path - the main executable file
// @param [String] path - the working directory
// @param [String] lib_path - the lib dir for the main target (default is "lib"), but could well be "ruby" or "opal" or indeed "" 
exports.run = function(path, cwd, lib_path) {
  bin_file = path;
  exports.getwd = opal_cwd = cwd;
  var require_path;
  
  if (!bin_file)
    throw "Opal: no bin file defined."
    
  var bin_path = bin_file + "/bin/" + bin_file + ".rb";
  
  if (exports.files[bin_path])
    require_path = bin_path;
    // exports.require(bin_path);
  else if (exports.files[bin_path = path + '/lib/' + path + '.rb']) {
    // bin_path = bin_file + "/lib/" + bin_file + ".rb";
    // exports.require(bin_path);
    require_path = bin_path;
  }
  else if (exports.files[bin_path = path + '/' + path + '.rb']) {
    // bin_path = bin_file + "/lib/" + bin_file + ".rb";
    // exports.require(bin_path);
    require_path = bin_path;
  }
  else {
    throw "cannot find bin file"
  }
  
  opal.entry_point(function() {
    // require our main "browser" spec as well - seems silly making the user
    // have to do this when we know for a fact we are in the browser.
    exports.require('browser');
    return exports.require(require_path);
  });
};

// require the file at the given path: we have already checked it exists - mark
// as being required - execute in context of top_self
// 
// params function(__FILE__) { .. }
var file_require_path = function(path) {
  // console.log("requiring " + path);
  var f = file_list[path];
  f.opal_required = true;
  return f.apply(exports.top_self, [path]);
};

// require the js string path.. might come from ruby, might come from js
exports.require = function(orig_path) {
  // console.log("native require: " + orig_path);
  // console.log(load_paths);
  var path = orig_path;
  // basically loop through each of the load paths looking for a match
  if ((path.substr(path.length - 3) != '.rb') && (path.substr(path.length -3) != '.js')) {
    // console.log("need to add .rb");
    path += '.rb'
  }
  
  for (var i = 0; i < load_paths.length; i++) {
    var try_path = load_paths[i] + path;
    // console.log("does exist? " + try_path);
    if (file_list.hasOwnProperty(try_path)) {
      if (file_list[try_path].opal_required) {
        // console.log("already required " + path);
        return;
      }
      // console.log("shit son!!!!");
      // console.log(file_list[try_path]);
      return file_require_path(try_path);
    }
  }
  
  throw "could not find require: " + orig_path;
};

// load the raw file, given as a function imolementation as the given filename
// 
// @param [String] filename
// @param [Function] implementation
exports.load_raw_file = function(filename, implementation) {
  return implementation.apply(exports.top_self);
};


// =========================
// = Browser bits and bobs =
// =========================

var browser = exports.browser = (function() {
  var agent = navigator.userAgent.toLowerCase();
  var version = 1;
  var browser = {
    version: 0,
    safari: (/webkit/).test(agent) ? version : 0,
    opera: (/opera/).test(agent) ? version : 0,
    msie: (/msie/).test(agent) && !(/opera/).test(agent) ? version : 0
  };
  
  return browser;
})();

// set callback for when opal/document is ready to go!
exports.setDocumentReadyListener = function(callback) {
  // run it in the context of top self
  var on_ready = function() {
    opal.entry_point(function() {
      callback.apply(opal.top_self);
    });
  };
  // attach ready function
  (function(){
    // w3c - firefox, safari, opera
    if (document.addEventListener) {
      document.addEventListener("DOMContentLoaded", on_ready, false);
    }
    // internet explorer
    if (exports.browser.msie) {
      (function() {
        try {
          document.documentElement.doScroll('left');
        }
        catch (e) {
          setTimeout(arguments.callee, 0);
          return;
        }
        on_ready();
      })();
    }

  })();
};


exports.glob_files = function(glob) {
  var working = glob.replace(/\*\*\//g, '.*').replace(/\*\*/g, '.*').replace(/\//g, '\\/');
  var result = [];
  var reg = new RegExp('^' + working + '$');
  for (var prop in opal.files) {
    if (reg.exec(prop)) {
      result.push(prop);
    }
  }
  return result;
};

// ================
// = On ready etc =
// ================
// var on_ready = function() {
  // console.log("===== on_ready");

// };


exports.ruby_platform = "browser";



// native xml http request
exports.request = (function() {
  try {
    new XMLHttpRequest();
    return function() {
      return new XMLHttpRequest();
    };
  }
  catch (e) {
    try {
      new ActiveXObject('MSXML2.XMLHTTP');
      return function() {
        return new ActiveXObject('MSXML2.XMLHTTP');
      };
    }
    catch (e) {
      try {
        new ActiveXObject('Microsoft.XMLHTTP');
        return function() {
          return new ActiveXObject('Microsoft.XMLHTTP');
        };
      }
      catch (e) {
        return function() {
          console.log("cannot create a native XMLHttpRequest");
        }
      }
    }
  }
})();
//  DEBUG

// only do this if we want a stack trace
  (function() {
    // Our stack trace class - js prototpye based class
    var StackTracer = function() {
      this.stack = [];
      this.file_stack = [];
      return this;
    };

    StackTracer.prototype = {
      
      reset: function() {
        this.stack = [];
        this.file_stack = [];
        return this;
      },

      start_file: function(filename) {
        this.file_stack.push(filename);
      },

      end_file: function() {
        this.file_stack.pop();
      },

      current_file: function() {
        return this.file_stack[this.file_stack.length - 1];
      },

      push: function(frame) {
        // console.log("calling " + m_id + " on " + obj.class_name);
        this.stack.push(frame);
      },

      pop: function(m_id, obj) {
        this.stack.pop();
      },

      backtrace: function() {
        
        // did we find null or undefined (mark as warning)
        var found_warning = false;
        
        // call $inspect on recv, but catches errors.. when we get an error we
        // return <undefined> or <null> to indicate we probably have null (or 
          // undefined where it should not be
        var inspect = function(recv) {
          try {
            return recv.$inspect();
          } catch (e) {
            found_warning = true;
            if (recv === undefined) 
              return "<undefined>";
            else if (recv === null)
              return "<null>";
            else
              return "<error>";
          }
        };
        // console.log("stack is:");
        // console.log(this.stack);
       var frame, str,  i = this.stack.length;
       while (i--) {
         // reset warning
         found_warning = false
         
         frame = this.stack[i];
         // console.log(frame);
         var args = frame.args;
         
         var str = '  from ' + frame.body.__opal_file__ + ':' + frame.body.__opal_line__ + ':in ' + inspect(frame.recv) + '.' + frame.mid;
         
         // console.log(frame.recv.$inspect());
         
         if (args.length > 0) {
           str += '(';
           for (var j = 0; j < args.length; j++) {
             if (j > 0) str += ', ';
             str += inspect(args[j]);
           }
           str += ')';
         } else {
           str += '()';
         }
         
         
         found_warning ? console.warn(str) : console.log(str);
       } 
      }
    };
    
    // our global stack tracking object
    var stack_tracer = exports.stack_trace = new StackTracer();
    
    // When loading raw files (used for core library), set the right filename
    var old_load_raw_file = exports.load_raw_file;
    exports.load_raw_file = function(filename, implementation) {
      stack_tracer.start_file(filename);
      var result = old_load_raw_file.apply(this, arguments);
      stack_tracer.end_file();
      return result;
    };
    
    // Replace the file_require_path method to make calls to stack_tracer
    var old_file_require_path = file_require_path;
    file_require_path = function(path) {
      stack_tracer.start_file(path);
      var result = old_file_require_path.apply(this, arguments);
      stack_tracer.end_file();
      return result;
    };
    
    
    // Our entry point must be modified to actually capture these potential
    // errors and then log the backtrace. Also, every time we begin an entry 
    // point, we must reset the stack tracer (it should be reset automatically 
    // by the right number of methods popping themselves off, but lets make sure
    // anyway)
    exports.entry_point = function(func) {
      stack_tracer.reset();
      try {
        return func();
      }
      catch (e) {
        console.error(e.toString());
        stack_tracer.backtrace();
      }
    };
    
    // Replace the define method function. The new implementation replaces the
    // given body with a custom body that marks when the method is called, and
    // then when it leaves. This is pushed/popped to the stack so we can keep
    // track of the call chain. The generatr actually gives us our line number
    // for each egneerated method, so in debug mode lets actuqllly use it
    var old_dm = __boot_base_class.prototype.dm;
    // wrap the given function so we can log traces
    var wrap = function(mid, body, singleton, line_number) {
      // keep track of what was defined where
      body.__opal_file__  = stack_tracer.current_file();
      body.__opal_line__ = line_number;
      // new implementation
      return function() {
        // console.log("calling " + mid);
        // stack_tracer.push(mid, this, body);
        stack_tracer.push({
          mid: mid,
          recv: this,
          body: body,
          args: Array.prototype.slice.call(arguments)
        });
        var result = body.apply(this, arguments);
        stack_tracer.pop();
        // console.log("finished calling " + mid);
        return result;
      };
    };

    __boot_base_class.prototype.dm = function(m_id, body, singleton, line) {
      // console.log("adding " + m_id);
      body = wrap(m_id, body, singleton, line);
      return old_dm.apply(this, [m_id, body, singleton]);
    };
    
    
    // In debug mode we support method_missing. This is ONLY FOR DEBUG mode.
    // This is not to be used for metaprgramming. Basically method_missing 
    // allows us to have nicer output from our method missing calls instead of
    // "this.ig("@adam").$do_something(....etc....)" we get normal ruby
    // formatted message. (ms = message_send)
    __boot_base_class.prototype.ms = function(mid) {
      // args are all the args after initial mid
      var args = Array.prototype.slice.call(arguments);
      // we could really do all the stack tracing in here..?
      
      //FIXME: incompletet
    };
    
  })();
})(this, opal);
// ##################### lib/kernel.rb #####################
opal.load_raw_file('opal/lib/kernel.rb', 
(function(__FILE__){this.define_class(this.n,'Kernel',function(){this.dm("block_given?",function(){return this.f;
},false, 41);
this.dm("!=",function(other){return this['$=='](other).r ? this.f : this.t;},false, 45);
this.dm("loop",function(){if (arguments.length > 0 && arguments[0].info & this.TP) {  var __block__ = arguments[0];}try {
      while (true) {
        __block__.apply(__block__.__self__, []);
      }
    } catch (e) {
      // capture break statements
      if (e.__keyword__ == 'break') {
        return e.opal_value;
      }
      
      // rethrow everything else
      throw e;
    }},false, 60);
this.dm("is_a?",function(klass){var search = this.isa;
    
    while (search) {
      if (search == klass)
        return this.t;
      
      search = search.super_class;
    }
    
    return this.f;},false, 76);
this.dm("nil?",function(){return this.f;
},false, 97);
this.dm("respond_to?",function(method){var method_id = method.$to_s().toString();
    method_id = this.mid2jsid(method_id);
    if (this[method_id]) {
      return this.t;
    }return this.f;
},false, 101);
this.dm("===",function(other){return this['$=='](other);
},false, 110);
this.dm("instance_variable_defined?",function(variable_name){return (this[variable_name.$to_s().toString()]) ? this.t : this.f;},false, 114);
this.dm("instance_variable_get",function(variable_name){return this.ig(variable_name.$to_s().toString());},false, 118);
this.dm("instance_variable_set",function(variable_name,value){this.is(variable_name.$to_s().toString(), value);return value;
},false, 122);
this.dm("__send__",function(method,args){method=arguments[0];args=Array.prototype.slice.call(arguments,1);var res= this['$' + method.$to_s()].apply(this, args);
    return res;},false, 127);
this.dm("class",function(){return this.isa;},false, 132);
this.dm("superclass",function(){return this.super_class;},false, 136);
this.dm("require",function(require_path){opal.require(require_path);return this.t;
},false, 149);
this.dm("proc",function(){if (arguments.length > 0 && arguments[0].info & this.TP) {  var __block__ = arguments[0];}if(((!__block__ || !__block__.r) ? this.f : this.t).r){return __block__;
}else{return this.$raise("ArgumentError: tried to create Proc object without a block");
}},false, 162);
this.dm("puts",function(args){console.log(args.$to_s().toString());return this.n;
},false, 176);
this.dm("rand",function(max){if (max == undefined) {  max = this.n;}if(max.r){return Math.floor(Math.random() * max)}else{return Math.random();}},false, 194);
this.dm("to_s",function(){return "#<" + this.class_name + ":" + this.id + ">";},false, 202);
this.dm("inspect",function(){return this.$to_s();
},false, 206);
this.dm("object_id",function(){return this.id;},false, 210);
this.dm("raise",function(exception,string){var msg = this.n,exc = this.n;msg=this.n;
if(exception['$is_a?'](this.const_get('String')).r){msg=exception;
exc=this.const_get('RuntimeError').$new(msg);
}else if(exception['$is_a?'](this.const_get('Exception')).r){exc=exception;
}else{if (string) { msg=string }exc=exception.$new(msg);
}exc.raise();},false, 231);
this.dm("fail",function(exception, string){if (exception == undefined) {  exception = this.n;}if (string == undefined) {  string = this.n;}return this.$raise(exception,string);
},false, 252);
this.dm("instance_eval",function(){if (arguments.length > 0 && arguments[0].info & this.TP) {  var __block__ = arguments[0];}if(((!__block__ || !__block__.r) ? this.f : this.t).r){__block__.apply(this);}else{return this.n;}},false, 256);
return this.dm("const_set",function(const_name,const_value){return this.const_set(const_name, const_value);},false, 263);
},2);
this.define_class(this.n,"String",function(){this.dm("to_s",function(){return this;
},false, 275);
return this.dm("inspect",function(){return '"' + this + '"';},false, 279);
},0);
return this.define_class(this.n,"Symbol",function(){return this.dm("to_s",function(){return this.__ptr__;},false, 285);
},0);
})
);
// ##################### lib/module.rb #####################
opal.load_raw_file('opal/lib/module.rb', 
(function(__FILE__){return this.define_class(this.n,"Module",function(){this.dm("===",function(object){return object['$is_a?'](this);
},false, 29);
this.dm("undef_method",function(symbol){return this.$puts(["need to undefine method: ",symbol.$to_s()].join(''));
},false, 33);
this.dm("define_method",function(method){var __block__ = 
              (arguments[1] && arguments[1].info & this.TP)
              ? arguments[1] : this.n;var mid = method.$to_s();
    this.dm(mid, __block__, false);return this;
},false, 37);
this.dm("alias_method",function(new_name,old_name){new_name=new_name.$to_s();
old_name=old_name.$to_s();
this.dm(new_name, this.allocator.prototype['$' + old_name], false);return this;
},false, 45);
this.dm("attr_accessor",function(attributes){attributes=Array.prototype.slice.call(arguments);this.$attr_reader.apply(this, attributes);this.$attr_writer.apply(this, attributes);return this;
},false, 57);
this.dm("to_s",function(){return this.class_name;},false, 64);
this.dm("attr_reader",function(attributes){attributes=Array.prototype.slice.call(arguments);attributes.$each(this.P(function(attribute){var mid = attribute.$to_s();
      this.dm(mid, function() {
        return this.ig('@' + mid);
      }, false);}));
return this;
},false, 70);
this.dm("attr_writer",function(attributes){attributes=Array.prototype.slice.call(arguments);attributes.$each(this.P(function(attribute){var mid = attribute.$to_s();
      var mid2 = mid + "=";
      this.dm(mid2, function(val) {
        return this.is('@' + mid, val);
      }, false);}));
return this;
},false, 81);
this.dm("const_set",function(id,value){return this.const_set(id, value);},false, 93);
return this.dm("module_eval",function(){if (arguments.length > 0 && arguments[0].info & this.TP) {  var __block__ = arguments[0];}if(((!__block__ || !__block__.r) ? this.f : this.t).r){__block__.apply(this);}else{return this.n;}},false, 97);
},0);
})
);
// ##################### lib/array.rb #####################
opal.load_raw_file('opal/lib/array.rb', 
(function(__FILE__){return this.define_class(this.n,"Array",function(){this.dm("[]",function(objs){objs=Array.prototype.slice.call(arguments);return objs;},true, 56);
this.dm("&",function(other){var result = this.n;result=[];
var seen = [];
    for (var i = 0; i < this.length; i++) {
      var test = this[i], hash = test.hash();
      if (seen.indexOf(hash) == -1) {
        for (var j = 0; j < other.length; j++) {
          var test_b = other[j], hash_b = test_b.hash();
          if ((hash == hash_b) && seen.indexOf(hash) == -1) {
            seen.push(hash);
            result.push(test);
          }
        }
      }
    }return result;
},false, 69);
this.dm("*",function(arg){if(arg['$is_a?'](this.const_get('String')).r){return this.$join(arg);
}else{var result = [];
      for (var i = 0; i < parseInt(arg); i++) {
        result = result.concat(this);
      }
      return result;}},false, 101);
this.dm("+",function(other_ary){return this.concat(other_ary);},false, 122);
this.dm("-",function(other_ary){return this.$raise(["Array","#- not implemented"].join(''));
},false, 135);
this.dm("<<",function(obj){this.push(obj);return this;
},false, 149);
this.dm("push",function(objs){objs=Array.prototype.slice.call(arguments);for (var i = 0; i < objs.length; i++) {
      this.push(objs[i]);
    }return this;
},false, 165);
this.dm("==",function(other){if (this === other) return this.t;
    if (!(other.info & this.TA)) return this.f;
    if (this.length !== other.length) return this.f;
    for (var i = 0; i < this.length; i++) {
      if (!this[i]['$=='](other[i]).r) return this.f;
    }return this.t;
},false, 188);
this.dm("[]",function(index, length){if (length == undefined) {  length = this.n;}var size = this.n;size=this.length;;
if(index['$is_a?'](this.const_get('Range')).r){this.$raise("need to implement range");
}else{if (index < 0) index += size;}if (index >= size || index < 0) return this.n;if(length.r){if (length <= 0) return [];return this.slice(index, index + length);}else{return this[index];}},false, 232);
this.$alias_method(this.Y("slice"),this.Y("[]"));
this.dm("[]=",function(index,value){return this[index] = value;},false, 253);
this.dm("assoc",function(obj){for (var i = 0; i < this.length; i++) {
      var test = this[i];
      if (test.info & this.TA && test[0] !== undefined && test[0]===obj) {
        return test;
      }
    }return this.n;
},false, 271);
this.dm("at",function(index){if (index < 0) {
      index += this.length;
    }
    if (index < 0 || index >= this.length) {
      return this.n;
    }
    return this[index];},false, 293);
this.dm("clear",function(){return this.splice(0, this.length);},false, 311);
this.dm("collect",function(){if (arguments.length > 0 && arguments[0].info & this.TP) {  var __block__ = arguments[0];}var result = this.n;result=[];
for (var i = 0; i < this.length; i++) {
      try {
        result.push(__block__.apply(__block__.__self__, [this[i]]));
      } catch (e) {
        if (e.__keyword__ == 'break') {
          return e.opal_value;
        }
        
        throw e;
      }
    }return result;
},false, 330);
this.$alias_method(this.Y("map"),this.Y("collect"));
this.dm("collect!",function(){if (arguments.length > 0 && arguments[0].info & this.TP) {  var __block__ = arguments[0];}for (var i = 0; i < this.length; i++) {
      try {
        this[i] = __block__.apply(__block__.__self__, [this[i]]);
      } catch (e) {
        if (e.__keyword__ == 'break') {
          return e.opal_value;
        }
        
        throw e;
      }
    }return this;
},false, 363);
this.$alias_method(this.Y("map!"),this.Y("collect!"));
this.dm("compact",function(){var result = this.n;result=[];
for (var i = 0; i < this.length; i++) {
      if (this[i] !== this.n)
        result.push(this[i]);
    }return result;
},false, 387);
this.dm("compact!",function(){var size = this.length;
    for (var i = 0; i < this.length; i++) {
      if (this[i] == this.n) {
        this.splice(i, 1);
        i--;
      }
    }return size == this.length ? this.n : this;},false, 407);
this.dm("concat",function(other_ary){var length = other_ary.length;
    for (var i = 0; i < length; i++) {
      this.push(other_ary[i]);
    }return this;
},false, 426);
this.dm("count",function(obj){if (obj !== undefined) {
      var total = 0;
      for (var i = 0; i < this.length; i++) {
        if (this[i] === obj) 
          total += 1;
      }
      return total;
    } else {
      return this.length;
    }},false, 449);
this.dm("delete",function(obj){var size = this.length;
    for (var i = 0; i < this.length; i++) {
      if (this[i]['$=='](obj).r) {
        this.splice(i, 1);
        i--;
      }
    }return size == this.length ? this.n : obj;},false, 482);
this.dm("delete_at",function(index){if (index < 0 || index >= this.length) return this.n;
    var res = this[index];
    this.splice(index, 1);
    return res;},false, 507);
this.dm("delete_if",function(){if (arguments.length > 0 && arguments[0].info & this.TP) {  var __block__ = arguments[0];}for (var i = 0; i < this.length; i++) {
      try {
        var res = __block__.apply(__block__.__self__, [this[i]]);
        if (res.r) {
          this.splice(i, 1);
          i--;
        }
      }
      catch (e) {
        throw "Array#delete_if catch not implemented yet"
      }
    }return this;
},false, 527);
this.dm("drop",function(n){if (n > this.length) return [];var result = [];for (var i = n; i < (this.length); i++) {
      result.push(this[i]);
    }return result;},false, 552);
this.dm("drop_while",function(){if (arguments.length > 0 && arguments[0].info & this.TP) {  var __block__ = arguments[0];}var result = []
    for (var i = 0; i < this.length; i++) {
      try {
        var res = __block__.apply(__block__.__self__, [this[i]]);
        if (!res.r) {
          result = this.slice(i);
          break;
        }
      }
      catch (e) {
        throw "Array#delete_if catch not implemented yet"
      }
    }
    return result;},false, 575);
this.dm("each",function(){if (arguments.length > 0 && arguments[0].info & this.TP) {  var __block__ = arguments[0];}for (var i = 0; i < this.length; i++) {
      try {
        __block__.apply(__block__.__self__, [this[i]]);
      } catch (e) {
        if (e.__keyword__ == 'redo') {
          i--;
        }
        else if (e.__keyword__ == 'break') {
          return e.opal_value;
        }
        else {
          throw e;
        }
      }
    }return this;
},false, 607);
this.dm("each_index",function(){if (arguments.length > 0 && arguments[0].info & this.TP) {  var __block__ = arguments[0];}for (var i = 0; i < this.length; i++) {
      try {
        __block__.apply(__block__.__self__, [i]);
      } catch (e) {
        if (e.__keyword__ == 'redo') {
          i--;
        }
        else if (e.__keyword__ == 'break') {
          return e.opal_value;
        }
        else {
          throw e;
        }
      }
    }return this;
},false, 641);
this.dm("empty?",function(){return this.length == 0 ? this.t : this.f;},false, 667);
this.$alias_method(this.Y("eql?"),this.Y("=="));
this.dm("fetch",function(index,defaults){var __block__ = 
              (arguments[2] && arguments[2].info & this.TP)
              ? arguments[2] : this.n;var idx = index;
    if (index < 0) index += this.length;
    if (index < 0 || index >= this.length) {
      if (defaults === undefined) {
        throw "IndexError.."
      }
      else if (defaults.info & this.TP) {
        return defaults.apply(defaults.__self__, [idx]);
      }
      else {
        return defaults;
      }
    }
    return this[index];},false, 697);
this.dm("index",function(object){if (object === undefined) {
      throw "need to return enumerator"
    } else if (object.info & this.TP) {
      for (var i = 0; i < this.length; i++) {
        if (object.apply(object.__self__, [this[i]]).r) {
          return i;
        }
      }
    } else {
      for (var i = 0; i < this.length; i++) {
        if (this[i]['$=='](object).r) {
          return i;
        }
      }
    }
    return this.n;},false, 735);
this.dm("first",function(count){if (count == undefined) {  count = this.n;}if(count.r){return this.slice(0, count);}else{if (this.length == 0) {
        return this.n;
      }
      return this[0];}},false, 767);
this.dm("flatten",function(level){if (level == undefined) {  level = this.n;}var result = [];
    for (var i = 0; i < this.length; i++) {
      var item = this[i];
      if (item.info & this.TA) {
        if (level == this.n) {
          result = result.concat(item.$flatten());
        }
        else if (level == 0) {
          result.push(item);
        }
        else {
          result = result.concat(item.$flatten(level - 1));
        }
      }
      else {
        result.push(item);
      }
    }
    return result;},false, 798);
this.dm("flatten!",function(level){var result = this.n,length = this.n;length=this.length;
result=this.$flatten(level);
this.$clear();
this.$concat(result);
if (this.length == length) {
      return this.n;
    }return this;
},false, 837);
this.dm("include?",function(member){for (var i = 0; i < this.length; i++) {
      if (member['$=='](this[i]).r) {
        return this.t;
      }
    }return this.f;
},false, 856);
this.dm("replace",function(other_ary){this.splice(0, this.length);
    for (var i = 0; i < other_ary.length; i++) {
      this.push(other_ary[i]);
    }return this;
},false, 877);
this.dm("insert",function(index,obj){index=arguments[0];obj=Array.prototype.slice.call(arguments,1);if (index < 0) index += (this.length + 1);
    if (index < 0 || index >= this.length) {
      throw "IndexError... out of range"
    }
    this.splice.apply(this, [index, 0].concat(obj));return this;
},false, 898);
this.dm("join",function(sep){if (sep == undefined) {  sep = "";}var result = [];
    for (var i = 0; i < this.length; i++) {
      result.push(this[i].$to_s());
    }
    return result.join(sep);},false, 919);
this.dm("keep_if",function(){if (arguments.length > 0 && arguments[0].info & this.TP) {  var __block__ = arguments[0];}for (var i = 0; i < this.length; i++) {
      try {
        var res = __block__.apply(__block__.__self__, [this[i]]);
        if (!res.r) {
          this.splice(i, 1);
          i--;
        }
      }
      catch (e) {
        throw "Array#keep_if catch not implemented yet"
      }
    }return this;
},false, 940);
this.dm("last",function(n){if (n == undefined) {  n = this.n;}if(n.r){return this.slice(this.length - n, this.length);}else{if (this.length == 0) {
        return this.n;
      }
      return this[this.length - 1];}},false, 968);
this.dm("length",function(){return this.length;},false, 986);
this.$alias_method(this.Y("size"),this.Y("length"));
this.dm("pop",function(n){if (n == undefined) {  n = this.n;}if(n.r){return this.splice(this.length - n, this.length);}else{if (this.length) {
        return this.pop();
      }
      return this.n;}},false, 1009);
this.dm("push",function(obj){obj=Array.prototype.slice.call(arguments);for (var i = 0; i < obj.length; i++) {
      this.push(obj[i]);
    }return this;
},false, 1031);
this.dm("rassoc",function(obj){for (var i = 0; i < this.length; i++) {
      var test = this[i];
      if (test.info & this.TA && test[1] !== undefined && test[1]===obj) {
        return test;
      }
    }return this.n;
},false, 1051);
this.dm("reject",function(){if (arguments.length > 0 && arguments[0].info & this.TP) {  var __block__ = arguments[0];}var result = [];
    for (var i = 0; i < this.length; i++) {
      try {
        var res = __block__.apply(__block__.__self__, [this[i]]);
        if (!res.r) {
          result.push(this[i]);
        }
      }
      catch (e) {
        throw "Array#reject catch not implemented yet"
      }
    }
    return result;},false, 1076);
this.dm("reject!",function(){if (arguments.length > 0 && arguments[0].info & this.TP) {  var __block__ = arguments[0];}var length = this.length;
    for (var i = 0; i < this.length; i++) {
      try {
        var res = __block__.apply(__block__.__self__, [this[i]]);
        if (res.r) {
          this.splice(i, 1);
          i--;
        }
      }
      catch (e) {
        throw "Array#reject catch not implemented yet"
      }
    }
    return this.length == length ? this.n : this;},false, 1110);
this.dm("reverse",function(){var result = [];
    for (var i = this.length - 1; i >= 0; i--) {
      result.push(this[i]);
    }
    return result;},false, 1136);
this.dm("reverse!",function(){return this.reverse();},false, 1154);
this.dm("reverse_each",function(){if (arguments.length > 0 && arguments[0].info & this.TP) {  var __block__ = arguments[0];}for (var i = this.length - 1; i >= 0; i--) {
      try {
        __block__.apply(__block__.__self__, [this[i]]);
      } catch (e) {
        if (e.__keyword__ == 'redo') {
          i++;
        }
        else if (e.__keyword__ == 'break') {
          return e.opal_value;
        }
        else {
          throw e;
        }
      }
    }return this;
},false, 1168);
this.dm("rindex",function(object){if (object === undefined) {
      throw "need to return enumerator"
    } else if (object.info & this.TP) {
      for (var i = this.length - 1; i > 0; i--) {
        if (object.apply(object.__self__, [this[i]]).r) {
          return i;
        }
      }
    } else {
      for (var i = this.length - 1; i > 0; i--) {
        if (this[i]['$=='](object).r) {
          return i;
        }
      }
    }
    return this.n;},false, 1202);
this.dm("select",function(){if (arguments.length > 0 && arguments[0].info & this.TP) {  var __block__ = arguments[0];}var result = [];
    for (var i = 0; i < this.length; i++) {
      try {
        var res = __block__.apply(__block__.__self__, [this[i]]);
        if (res.r) {
          result.push(this[i]);
        }
      }
      catch (e) {
        throw "Array#select catch not implemented yet"
      }
    }
    return result;},false, 1232);
this.dm("select!",function(){if (arguments.length > 0 && arguments[0].info & this.TP) {  var __block__ = arguments[0];}var length = this.length;
    for (var i = 0; i < this.length; i++) {
      try {
        var res = __block__.apply(__block__.__self__, [this[i]]);
        if (!res.r) {
          this.splice(i, 1);
          i--;
        }
      }
      catch (e) {
        throw "Array#select! catch not implemented yet"
      }
    }
    return this.length == length ? this.n : this;},false, 1266);
this.dm("shift",function(n){if (n == undefined) {  n = this.n;}if(n.r){return this.splice(0, n);}else{if (this.length) {
        return this.shift();
      }
      return this.n;}},false, 1303);
this.dm("slice!",function(index, length){if (length == undefined) {  length = this.n;}var size = this.n;size=this.length;;
if(index['$is_a?'](this.const_get('Range')).r){this.$raise("need to implement range");
}else{if (index < 0) index += size;}if (index >= size || index < 0) return this.n;if(length.r){if (length <= 0 || length > this.length) return this.n;return this.splice(index, index + length);}else{return this.splice(index, 1)[0];}},false, 1338);
this.dm("take",function(n){return this.slice(0, n);},false, 1364);
this.dm("take_while",function(){if (arguments.length > 0 && arguments[0].info & this.TP) {  var __block__ = arguments[0];}var result = [];
    for (var i = 0; i < this.length; i++) {
      try {
        var res = __block__.apply(__block__.__self__, [this[i]]);
        if (res.r) {
          result.push(this[i]);
        } else {
          break;
        }
      }
      catch (e) {
        throw "Array#take_while catch not implemented yet"
      }
    }
    return result;},false, 1381);
this.dm("to_a",function(){return this;
},false, 1407);
this.dm("to_ary",function(){return this;
},false, 1419);
this.dm("uniq",function(){var result = [], seen = [];
    for (var i = 0; i < this.length; i++) {
      var test = this[i], hash = test.hash().toString();
      if (seen.indexOf(hash) == -1) {
        seen.push(hash);
        result.push(test);
      }
    }
    return result;},false, 1433);
this.dm("uniq!",function(){var seen = [], length = this.length;
    for (var i = 0; i < this.length; i++) {
      var test = this[i], hash = test.hash().toString();
      if (seen.indexOf(hash) == -1) {
        seen.push(hash);
      } else {
        this.splice(i, 1);
        i--;
      }
    }
    return this.length == length ? this.n : this;},false, 1456);
this.dm("unshift",function(object){object=Array.prototype.slice.call(arguments);for (var i = object.length - 1; i >= 0 ; i--) {
      this.unshift(object[i]);
    }return this;
},false, 1481);
this.dm("each_with_index",function(){if (arguments.length > 0 && arguments[0].info & this.TP) {  var __block__ = arguments[0];}for (var i = 0; i < this.length; i++) {
        try {
          __block__.apply(__block__.__self__, [this[i], i]);
        } catch (e) {
          if (e.__keyword__ == 'redo') {
            i--;
          }
          else if (e.__keyword__ == 'break') {
            return e.opal_value;
          }
          else {
            throw e;
          }
        }
      }return this;
},false, 1488);
return this.dm("inspect",function(){var description = this.n;description=["["];
this.$each_with_index(this.P(function(item,index){if(index['$>'](0).r){description['$<<'](", ");
}else{this.n;}return description['$<<'](item.$inspect());
}));
description['$<<']("]");
return description.$join("");
},false, 1507);
},0);
})
);
// ##################### lib/basic_object.rb #####################
opal.load_raw_file('opal/lib/basic_object.rb', 
(function(__FILE__){return this.define_class(this.n,"BasicObject",function(){this.dm("initialize",function(){return this.n;},false, 29);
this.dm("==",function(obj){return this === obj ? this.t : this.f;},false, 33);
this.dm("equal?",function(other){return this.n;},false, 37);
this.dm("!",function(){return this.f;
},false, 41);
return this.dm("!=",function(other){return this['$=='](other).r ? this.f : this.t;},false, 45);
},0);
})
);
// ##################### lib/class.rb #####################
opal.load_raw_file('opal/lib/class.rb', 
(function(__FILE__){return this.define_class(this.n,"Class",function(){this.dm("include",function(mod){return this.include(mod);},false, 29);
this.dm("extend",function(mod){return this.extend(mod);},false, 33);
this.dm("allocate",function(){return new this.allocator();},false, 37);
this.dm("new",function(super_class){return opal.__subclass("", super_class);},true, 41);
this.dm("new",function(){var obj = this.n;obj=this.$allocate();
obj.$initialize.apply(obj, arguments);return obj;
},false, 45);
return this.dm("initialize",function(){return this.$puts("in Class.new initialize");
},false, 51);
},0);
})
);
// ##################### lib/dir.rb #####################
opal.load_raw_file('opal/lib/dir.rb', 
(function(__FILE__){return this.define_class(this.n,"Dir",function(){this.dm("getwd",function(){return opal.getwd;},true, 29);
return this.dm("glob",function(glob){return opal.glob_files(glob);},true, 33);
},0);
})
);
// ##################### lib/error.rb #####################
opal.load_raw_file('opal/lib/error.rb', 
(function(__FILE__){this.define_class(this.n,"Exception",function(){this.dm("message",function(){return this.ig('@message');
},false, 30);
return this.dm("initialize",function(message){if (!message) {
      message = this.n;
    }return this.is("@message",message);
},false, 34);
},0);
this.define_class(this.const_get('Exception'),"RuntimeError",function(){},0);
return this.define_class(this.const_get('Exception'),"StandardError",function(){},0);
})
);
// ##################### lib/false_class.rb #####################
opal.load_raw_file('opal/lib/false_class.rb', 
(function(__FILE__){return this.define_class(this.n,"FalseClass",function(){this.dm("inspect",function(){return "false";
},false, 29);
this.dm("to_s",function(){return "false";
},false, 33);
this.dm("!",function(){return this.t;
},false, 37);
this.dm("&",function(other){return this.f;
},false, 41);
this.dm("|",function(other){return (other).r ? this.t : this.f;
},false, 45);
return this.dm("^",function(other){return (other).r ? this.t : this.f;
},false, 49);
},0);
})
);
// ##################### lib/file.rb #####################
opal.load_raw_file('opal/lib/file.rb', 
(function(__FILE__){return this.define_class(this.n,"File",function(){this.dm("join",function(parts){parts=Array.prototype.slice.call(arguments);return parts.join("/");},true, 33);
this.dm("dirname",function(file_name){return file_name.substr(0, file_name.lastIndexOf('/'));},true, 47);
return this.dm("expand_path",function(path){if (path == undefined) {  path = "";}var start_slash = (path[0] === "/");
    var parts = path.split("/");
    var result = [];
    var part;
    for (var i = 0; i < parts.length; i++) {
      part = parts[i];
      switch (part) {
        case '..':
          result.pop();
          break;
        case '.':
          break;
        case '':
          break;
        default:
          result.push(part);
      }
    }
    
    if (start_slash) {
      // if we started with a slash, use that
      return "/" + result.join("/");
    } else {
      // otherwise join with our current working dir
      return opal.getwd + "/" + result.join("/");
    }},true, 51);
},0);
})
);
// ##################### lib/hash.rb #####################
opal.load_raw_file('opal/lib/hash.rb', 
(function(__FILE__){return this.define_class(this.n,"Hash",function(){this.dm("[]",function(all){all=Array.prototype.slice.call(arguments);return vnH.apply(this, all);},true, 44);
this.dm("==",function(other){if (this === other) return this.t;
    if (!(other.info & this.TH)) return this.f
    if (this.__keys__.length !== other.__keys__.length) return this.f;
    for (var i = 0; i < this.__keys__.length; i++) {
      var key = this.__keys__[i].hash();
      if (!(this.__assocs__[key]['$=='](other.__assocs__[key]).r)) return this.f;
    }return this.t;
},false, 66);
this.$alias_method(this.Y("eql?"),this.Y("=="));
this.dm("[]",function(key){return this.hash_fetch(key);},false, 91);
this.dm("[]=",function(key,value){return this.hash_store(key, value);},false, 111);
this.$alias_method(this.Y("store"),this.Y("[]="));
this.dm("assoc",function(obj){var key;
    for (var i = 0; i < this.__keys__.length; i++) {
      key = this.__keys__[i];
      if (key['$=='](obj).r) {
        return [key, this.__assocs__[key.hash()]];
      }
    }return this.n;
},false, 130);
this.dm("clear",function(){this.__keys__ = [];
    this.__assocs__ = {};return this;
},false, 149);
this.dm("default",function(key){if (key == undefined) {  key = this.n;}return this.__default__;},false, 171);
this.dm("default=",function(obj){return this.__default__ = obj;},false, 189);
this.dm("delete",function(key){return this.hash_delete(key);},false, 209);
this.dm("delete_if",function(){if (arguments.length > 0 && arguments[0].info & this.TP) {  var __block__ = arguments[0];}var key, value;
    for (var i = 0; i < this.__keys__.length; i++) {
      key = this.__keys__[i];
      value = this.__assocs__[key.hash()];
      if (__block__.apply(__block__.__self__, [key, value]).r) {
        this.hash_delete(key);
        i--;
      };
    }return this;
},false, 226);
this.dm("each",function(){if (arguments.length > 0 && arguments[0].info & this.TP) {  var __block__ = arguments[0];}var key, value;
    for (var i = 0; i < this.__keys__.length; i++) {
      key = this.__keys__[i];
      value = this.__assocs__[key.hash()];
      __block__.apply(__block__.__self__, [key, value]);
    }return this;
},false, 253);
this.$alias_method(this.Y("each_pair"),this.Y("each"));
this.dm("each_key",function(){if (arguments.length > 0 && arguments[0].info & this.TP) {  var __block__ = arguments[0];}var key;
    for (var i = 0; i < this.__keys__.length; i++) {
      key = this.__keys__[i];
      __block__.apply(__block__.__self__, [key]);
    }return this;
},false, 274);
this.dm("each_value",function(){if (arguments.length > 0 && arguments[0].info & this.TP) {  var __block__ = arguments[0];}var key, value;
    for (var i = 0; i < this.__keys__.length; i++) {
      key = this.__keys__[i];
      value = this.__assocs__[key.hash()];
      __block__.apply(__block__.__self__, [value]);
    }return this;
},false, 292);
this.dm("empty?",function(){return this.__keys__.length == 0 ? this.t : this.f;},false, 309);
this.dm("fetch",function(key,defaults){var value = this.__assocs__[key.hash()];
    if (value !== undefined) {
      return value;
    } else if (defaults === undefined) {
      throw "KeyError: key not found";
    } else if (defaults.info & this.TP) {
      return defaults.apply(defaults.__self__, [key]);
    } else {
      return defaults;
    }},false, 333);
this.dm("flatten",function(level){if (level == undefined) {  level = 1;}var result = [], key, value;
    for (var i = 0; i < this.__keys__.length; i++) {
      key = this.__keys__[i];
      value = this.__assocs__[key.hash()];
      result.push(key);
      if (value.info & this.TA) {
        if (level == 1) {
          result.push(value);
        } else {
          var temp = value.$flatten(level - 1);
          result = result.concat(temp);
        }
      } else {
        result.push(value);
      }
    }
    return result;},false, 361);
this.dm("has_key?",function(key){return this.__assocs__.hasOwnProperty(key.hash()) ? this.t : this.f;},false, 392);
this.$alias_method(this.Y("include?"),this.Y("has_key?"));
this.$alias_method(this.Y("key?"),this.Y("has_key?"));
this.$alias_method(this.Y("member?"),this.Y("has_key?"));
this.dm("has_value?",function(value){var key, val;
    for (var i = 0; i < this.__keys__.length; i++) {
      key = this.__keys__[i];
      val = this.__assocs__[key.hash()];
      if (value['$=='](val).r) {
        return this.t;
      };
    }return this.f;
},false, 411);
this.$alias_method(this.Y("value?"),this.Y("has_value?"));
this.dm("replace",function(other_hash){this.__keys__ = [];
    this.__assocs__ = {};
    for (var i = 0; i < other_hash.__keys__.length; i++) {
      key = other_hash.__keys__[i];
      val = other_hash.__assocs__[key.hash()];
      this.hash_store(key, val)
    }return this;
},false, 434);
this.dm("inspect",function(){var result = ['{'], key, value;
    for (var i = 0; i < this.__keys__.length; i++) {
      key = this.__keys__[i];
      value = this.__assocs__[key.hash()];
      if (i > 0) result.push(', ');
      result.push(key.$inspect());
      result.push('=>');
      result.push(value.$inspect());
    }
    result.push('}');
    return result.join('');},false, 452);
this.$alias_method(this.Y("to_s"),this.Y("inspect"));
this.dm("invert",function(){var res = vnH();
    for (var i = 0; i < this.__keys__.length; i++) {
      key = this.__keys__[i];
      value = this.__assocs__[key.hash()];
      res.hash_store(value, key);
    }
    return res;},false, 477);
this.dm("keep_if",function(){if (arguments.length > 0 && arguments[0].info & this.TP) {  var __block__ = arguments[0];}var key, value;
    for (var i = 0; i < this.__keys__.length; i++) {
      key = this.__keys__[i];
      value = this.__assocs__[key.hash()];
      if (!__block__.apply(__block__.__self__, [key, value]).r) {
        this.hash_delete(key);
        i--;
      };
    }return this;
},false, 500);
this.dm("key",function(value){var key, val;
    for (var i = 0; i < this.__keys__.length; i++) {
      key = this.__keys__[i];
      val = this.__assocs__[key.hash()];
      if (value['$=='](val).r) {
        return key;
      };
    }return this.n;
},false, 524);
this.dm("keys",function(){return this.__keys__.slice();},false, 545);
this.dm("length",function(){return this.__keys__.length;},false, 560);
this.$alias_method(this.Y("size"),this.Y("length"));
this.dm("merge",function(other_hash){var result = vnH(), key, val;
    for (var i = 0; i < this.__keys__.length; i++) {
      key = this.__keys__[i];
      val = this.__assocs__[key.hash()];
      result.hash_store(key, val)
    }
    for (var i = 0; i < other_hash.__keys__.length; i++) {
      key = other_hash.__keys__[i];
      val = other_hash.__assocs__[key.hash()];
      result.hash_store(key, val)
    }
    return result;},false, 584);
this.dm("merge!",function(other_hash){var key, val;
    for (var i = 0; i < other_hash.__keys__.length; i++) {
      key = other_hash.__keys__[i];
      val = other_hash.__assocs__[key.hash()];
      this.hash_store(key, val)
    }
    return this;},false, 617);
this.$alias_method(this.Y("update"),this.Y("merge!"));
this.dm("rassoc",function(obj){var key, val;
    for (var i = 0; i < this.__keys__.length; i++) {
      key = this.__keys__[i];
      val = this.__assocs__[key.hash()];
      if (val['$=='](obj).r) {
        return [key, val];
      }
    }return this.n;
},false, 642);
this.dm("reject",function(){if (arguments.length > 0 && arguments[0].info & this.TP) {  var __block__ = arguments[0];}var result = vnH(), key, value;
    for (var i = 0; i < this.__keys__.length; i++) {
      key = this.__keys__[i];
      value = this.__assocs__[key.hash()];
      if (!__block__.apply(__block__.__self__, [key, value]).r) {
        result.hash_store(key, value);
      };
    }
    return result;},false, 657);
this.dm("reject!",function(){if (arguments.length > 0 && arguments[0].info & this.TP) {  var __block__ = arguments[0];}var key, value, size = this.__keys__.length;
    for (var i = 0; i < this.__keys__.length; i++) {
      key = this.__keys__[i];
      value = this.__assocs__[key.hash()];
      if (__block__.apply(__block__.__self__, [key, value]).r) {
        this.hash_delete(key);
        i--;
      };
    }
    return this.__keys__.length == size ? this.n : this},false, 672);
this.dm("select",function(){if (arguments.length > 0 && arguments[0].info & this.TP) {  var __block__ = arguments[0];}var result = vnH(), key, value;
    for (var i = 0; i < this.__keys__.length; i++) {
      key = this.__keys__[i];
      value = this.__assocs__[key.hash()];
      if (__block__.apply(__block__.__self__, [key, value]).r) {
        result.hash_store(key, value);
      };
    }
    return result;},false, 697);
this.dm("select!",function(){if (arguments.length > 0 && arguments[0].info & this.TP) {  var __block__ = arguments[0];}var key, value, size = this.__keys__.length;
    for (var i = 0; i < this.__keys__.length; i++) {
      key = this.__keys__[i];
      value = this.__assocs__[key.hash()];
      if (!__block__.apply(__block__.__self__, [key, value]).r) {
        this.hash_delete(key);
        i--;
      };
    }
    return this.__keys__.length == size ? this.n : this},false, 712);
this.dm("shift",function(){var key, value;
    if (this.__keys__.length > 0) {
      key = this.__keys__[0];
      value = this.__assocs__[key.hash()];
      this.hash_delete(key);
      return [key, value];
    } else {
      return this.__default__;
    }},false, 738);
this.dm("to_a",function(){var result = [], key, value;
    for (var i = 0; i < this.__keys__.length; i++) {
      key = this.__keys__[i];
      value = this.__assocs__[key.hash()];
      result.push([key, value]);
    }
    return result;},false, 758);
this.dm("to_hash",function(){return this;
},false, 771);
return this.dm("values",function(){var result = [];
    for (var i = 0; i < this.__keys__.length; i++) {
      result.push(this.__assocs__[this.__keys__[i].hash()]);
    }
    return result;},false, 783);
},0);
})
);
// ##################### lib/io.rb #####################
opal.load_raw_file('opal/lib/io.rb', 
(function(__FILE__){return this.define_class(this.n,"IO",function(){return this.dm("puts",function(objects){objects=Array.prototype.slice.call(arguments);if(objects.$length()['$=='](0).r){}else{objects.$each(this.P(function(object){}));
}return this.n;
},false, 29);
},0);
})
);
// ##################### lib/match_data.rb #####################
opal.load_raw_file('opal/lib/match_data.rb', 
(function(__FILE__){return this.define_class(this.n,"MatchData",function(){this.dm("initialize",function(data){return this.is("@data",data);
},false, 29);
return this.dm("inspect",function(){return ["#<MatchData '",this.ig('@data')['$[]'](0).$to_s(),"'>"].join('');
},false, 33);
},0);
})
);
// ##################### lib/nil_class.rb #####################
opal.load_raw_file('opal/lib/nil_class.rb', 
(function(__FILE__){return this.define_class(this.n,"NilClass",function(){this.dm("nil?",function(){return this.t;
},false, 29);
this.dm("!",function(){return this.t;
},false, 33);
this.dm("to_i",function(){return 0;
},false, 37);
this.dm("to_f",function(){return 0.0;
},false, 41);
this.dm("to_s",function(){return "";
},false, 45);
this.dm("to_a",function(){return [];
},false, 49);
this.dm("inspect",function(){return "nil";
},false, 53);
this.dm("&",function(other){return this.f;
},false, 57);
this.dm("|",function(other){return (other).r ? this.t : this.f;
},false, 61);
return this.dm("^",function(other){return (other).r ? this.t : this.f;
},false, 65);
},0);
})
);
// ##################### lib/number.rb #####################
opal.load_raw_file('opal/lib/number.rb', 
(function(__FILE__){return this.define_class(this.n,"Number",function(){this.dm("+@",function(){return this;
},false, 36);
this.dm("-@",function(){return -this;},false, 47);
this.dm("%",function(other){return this % other;},false, 55);
this.$alias_method(this.Y("modulo"),this.Y("%"));
this.dm("&",function(other){return this & other;},false, 65);
this.dm("*",function(other){return this * other;},false, 73);
this.dm("**",function(other){return Math.pow(this, other);},false, 81);
this.dm("+",function(other){return this + other;},false, 89);
this.dm("-",function(other){return this - other;},false, 97);
this.dm("/",function(other){return this / other;},false, 105);
this.dm("<",function(other){return this < other ? this.t : this.f;},false, 114);
this.dm("<=",function(other){return this <= other ? this.t : this.f;},false, 123);
this.dm(">",function(other){return this > other ? this.t : this.f;},false, 132);
this.dm(">=",function(other){return this >= other ? this.t : this.f;},false, 141);
this.dm("<<",function(count){return this << count;},false, 149);
this.dm(">>",function(count){return this >> count;},false, 157);
this.dm("<=>",function(other){if (!(other.info & this.TN)) return this.n;
    else if (this < other) return -1;
    else if (this > other) return 1;
    return 0;},false, 166);
this.dm("==",function(other){return (this.valueOf() === other.valueOf()) ? this.t : this.f;},false, 177);
this.dm("^",function(other){return this ^ other;},false, 185);
this.dm("abs",function(){return Math.abs(this);},false, 198);
this.$alias_method(this.Y("magnitude"),this.Y("abs"));
this.dm("even?",function(){return (this % 2 == 0) ? this.t : this.f;},false, 207);
this.dm("odd?",function(){return (this % 2 == 0) ? this.f : this.t;},false, 214);
this.dm("next",function(){return parseInt(this) + 1;},false, 227);
this.$alias_method(this.Y("succ"),this.Y("next"));
this.dm("pred",function(){return parseInt(this) -1;},false, 242);
this.dm("upto",function(finish){var __block__ = 
              (arguments[1] && arguments[1].info & this.TP)
              ? arguments[1] : this.n;for (var i = this; i <= finish; i++) {
      __block__.apply(__block__.__self__, [i]);
    }return this;
},false, 264);
this.dm("downto",function(finish){var __block__ = 
              (arguments[1] && arguments[1].info & this.TP)
              ? arguments[1] : this.n;for (var i = this; i >= finish; i--) {
      __block__.apply(__block__.__self__, [i]);
    }return this;
},false, 288);
this.dm("times",function(){if (arguments.length > 0 && arguments[0].info & this.TP) {  var __block__ = arguments[0];}for (var i = 0; i < this; i++) {
       __block__.apply(__block__.__self__, [i]);
    }return this;
},false, 310);
this.dm("|",function(other){return this | other;},false, 321);
this.dm("zero?",function(){return this.valueOf() === 0 ? this.t : this.f;},false, 328);
this.dm("nonzero?",function(){return this.valueOf() === 0 ? this.n : this;},false, 335);
this.dm("~",function(){return ~this;},false, 342);
this.dm("ceil",function(){return Math.ceil(this);},false, 359);
this.dm("floor",function(){return Math.floor(this);},false, 372);
this.dm("integer?",function(){return this % 1 === 0 ? this.t : this.f;},false, 379);
this.dm("inspect",function(){return this.toString();},false, 383);
this.dm("to_s",function(){return this.toString();},false, 387);
return this.dm("to_i",function(){return parseInt(this);},false, 392);
},0);
})
);
// ##################### lib/proc.rb #####################
opal.load_raw_file('opal/lib/proc.rb', 
(function(__FILE__){return this.define_class(this.n,"Proc",function(){this.dm("to_proc",function(){return this;
},false, 29);
this.dm("call",function(){if (this.__lambda__) {
      try {
        return this.apply(this.__self__, []);
      }
      catch (e) {
        // first try and catch a break (from the lambda proc)
        if (e.__keyword__ == 'break') {
          //console.log("break!");
          return e.opal_value;
        }
        
        // look for next statements
        if (e.__keyword__ == 'next') {
          return e.opal_value;
        }
        
        // next try and catch return error statement (simply return it)
        if (e.__keyword__ == 'return') {
          return e.opal_value;
        }
        
        // redo - simply recall block?
        if (e.__keyword__ == 'redo') {
          return arguments.callee.apply(this);
        }
        
        // worst case, rethrow error
        throw e;
      }
    }
    else {
      //throw "cannot .call for non lambda block.. yet"
      return this.apply(this.__self__);
    }},false, 33);
this.dm("to_s",function(){return "#<" + this.class_name + ":" + this.id + ">";},false, 70);
return this.dm("inspect",function(){return this.$to_s();
},false, 74);
},0);
})
);
// ##################### lib/range.rb #####################
opal.load_raw_file('opal/lib/range.rb', 
(function(__FILE__){return this.define_class(this.n,"Range",function(){this.dm("new",function(start,ending,exclusive){if (!exclusive) {
      exclusive = this.f;
    }return this.R(start, ending, exclusive.r);},true, 29);
this.dm("length",function(){return this.__end__ - this.__start__;},false, 36);
this.dm("begin",function(){return this.__start__;},false, 40);
this.dm("end",function(){return this.__end__;},false, 44);
this.dm("===",function(val){return this['$include?'](val);
},false, 48);
this.dm("cover?",function(val){return this['$include?'](val);
},false, 52);
this.dm("include?",function(val){return (this.__start__ <= val && val <= this.__real_end__) ? this.t : this.f;},false, 56);
return this.dm("exclude_end?",function(){return this.__exclusive__ ? this.t : this.f;},false, 60);
},0);
})
);
// ##################### lib/regexp.rb #####################
opal.load_raw_file('opal/lib/regexp.rb', 
(function(__FILE__){return this.define_class(this.n,"Regexp",function(){this.dm("inspect",function(){return this.toString();},false, 44);
this.dm("==",function(other_regexp){return this.toString() === other_regexp.toString() ? this.t : this.f;},false, 59);
this.dm("===",function(str){if (this.exec(str)) {
      return this.t;
    } else {
      return this.f;
    }},false, 77);
this.$alias_method(this.Y("eql?"),this.Y("=="));
return this.dm("match",function(string){var m = this.n;m=this.n;
if (m = this.exec(string)) {
      return this.const_get('MatchData').$new(m);
    } else {
      return this.n;
    }},false, 102);
},0);
})
);
// ##################### lib/ruby.rb #####################
opal.load_raw_file('opal/lib/ruby.rb', 
(function(__FILE__){this.const_set("RUBY_PLATFORM",opal.ruby_platform);
})
);
// ##################### lib/string.rb #####################
opal.load_raw_file('opal/lib/string.rb', 
(function(__FILE__){return this.define_class(this.n,"String",function(){this.dm("new",function(str){if (str == undefined) {  str = "";}return new String(str);},true, 44);
this.dm("*",function(num){var res = [];
    for (var i = 0; i < num; i++) {
      res.push(this);
    }
    return res.join('');},false, 56);
this.dm("+",function(other_str){return this + other_str;},false, 73);
this.dm("<=>",function(other_str){if (!(other_str.info & this.TS)) return this.n;
    else if (this > other_str) return 1;
    else if (this < other_str) return -1;
    return 0;},false, 92);
this.dm("==",function(other){return (this.valueOf() === other.valueOf()) ? this.t : this.f;},false, 104);
this.dm("capitalize",function(){return this[0].toUpperCase() + this.substr(1).toLowerCase();},false, 120);
this.dm("casecmp",function(other_str){var a = this.toLowerCase(), b = other_str.toLowerCase();
    if (!(b.info & a.TS)) return this.n;
    else if (a > b) return 1;
    else if (a < b) return -1;
    return 0;},false, 138);
this.dm("downcase",function(){return this.toLowerCase();},false, 154);
this.dm("empty?",function(){return this == '' ? this.t : this.f;},false, 167);
this.dm("end_with?",function(suffix){if (suffix == undefined) {  suffix = "";}return (suffix != '' && this.lastIndexOf(suffix) == (this.length - suffix.length)) ? this.t : this.f;},false, 179);
this.dm("eql?",function(other){return (this == other) ? this.t : this.f;},false, 187);
this.dm("include?",function(other_str){var res = this.indexOf(other_str);
    if (res != -1) {
      return this.t;
    }
    return this.f;},false, 203);
this.dm("index",function(substring){var res = this.indexOf(substring);
    if (res != -1) {
      return res;
    }
    return this.n;},false, 228);
this.dm("inspect",function(){return '"' + this + '"';},false, 247);
this.dm("intern",function(){return this.Y(this);},false, 274);
this.$alias_method(this.Y("to_sym"),this.Y("intern"));
this.dm("length",function(){return this.length;},false, 283);
this.$alias_method(this.Y("size"),this.Y("length"));
this.dm("lstrip",function(){return this.replace(/^\s*/, "");},false, 299);
this.dm("reverse",function(){return this.split('').reverse().join('');},false, 310);
this.dm("slice",function(start,finish){return this.substr(start, finish);},false, 316);
this.dm("to_s",function(){return this;
},false, 320);
return this.dm("split",function(str){return this.split(str);},false, 324);
},0);
})
);
// ##################### lib/symbol.rb #####################
opal.load_raw_file('opal/lib/symbol.rb', 
(function(__FILE__){return this.define_class(this.n,"Symbol",function(){this.dm("inspect",function(){return ":" + this.__ptr__;},false, 29);
this.dm("to_s",function(){return this.__ptr__;},false, 33);
return this.dm("to_sym",function(){return this;
},false, 37);
},0);
})
);
// ##################### lib/top_self.rb #####################
opal.load_raw_file('opal/lib/top_self.rb', 
(function(__FILE__){this.dm("to_s",function(){return "main";
},false, 27);
return this.dm("include",function(mod){return this.const_get('Object').$include(mod);
},false, 31);
})
);
// ##################### lib/true_class.rb #####################
opal.load_raw_file('opal/lib/true_class.rb', 
(function(__FILE__){return this.define_class(this.n,"TrueClass",function(){this.dm("to_s",function(){return "true";
},false, 29);
this.dm("&",function(other){return (other).r ? this.t : this.f;
},false, 33);
this.dm("|",function(other){return this.t;
},false, 37);
return this.dm("^",function(other){return (other).r ? this.f : this.t;
},false, 41);
},0);
})
);
opal.register({
  "name": "opal",
  "files": {

  }
});
opal.register({
  "name": "browser",
  "files": {
    "lib/browser/builder.rb": (function(__FILE__){return this.define_class(this.n,"Element",function(){return this.define_class(this.n,"Builder",function(){},0);
},0);
}),
    "lib/browser/canvas_context.rb": (function(__FILE__){return this.define_class(this.n,"Element",function(){return this.define_class(this.n,"CanvasContext",function(){this.dm("initialize",function(element){this.__ctx__ = element.__element__.getContext('2d');var ctx = this.__ctx__;this.$begin_path();
this.$move_to(30,30);
this.$line_to(150,150);
this.$bezier_curve_to(60,70,60,70,70,150);
this.$line_to(30,30);
return this.$fill(vnH(this.Y("fill_style"),"blue"));
},false, 45);
this.dm("fill_style=",function(style){this.__ctx__.fillStyle = style;return this;
},false, 59);
this.dm("begin_path",function(){this.__ctx__.beginPath();return this;
},false, 64);
this.dm("move_to",function(x,y){this.__ctx__.moveTo(x, y);return this;
},false, 69);
this.dm("line_to",function(x,y){this.__ctx__.lineTo(x, y);return this;
},false, 74);
this.dm("bezier_curve_to",function(a,b,c,d,e,f){this.__ctx__.bezierCurveTo(a, b, c, d, e, f);return this;
},false, 79);
this.dm("fill",function(attributes){if (attributes == undefined) {  attributes = vnH();}this.$save();
this.$set(attributes);
this.__ctx__.fill();this.$restore();
return this;
},false, 84);
this.dm("save",function(){this.__ctx__.save();return this;
},false, 97);
this.dm("restore",function(){this.__ctx__.restore();return this;
},false, 102);
return this.dm("set",function(attributes){if (attributes == undefined) {  attributes = vnH();}attributes.$each(this.P(function(key,value){this.$puts(["sending ",key.$to_s(),"="].join(''));
return this.$__send__([key.$to_s(),"="].join(''),value);
}));
return this;
},false, 107);
},0);
},0);
}),
    "lib/browser/dimensions.rb": (function(__FILE__){return this.define_class(this.n,"Element",function(){this.dm("size",function(){var elem = this.n;elem=this.__element__;
return this.const_get('Size').$new(elem.offsetWidth,elem.offsetHeight);
},false, 37);
return this.dm("position",function(){return this.n;},false, 47);
},0);
}),
    "lib/browser/document.rb": (function(__FILE__){return this.define_class(this.n,'Document',function(){this.dm("[]",function(selector){var $a = this.n;$a = selector;if(this.const_get('Symbol')['$===']($a).r) {return this.$find_by_id(selector);
}else if(/^#/['$===']($a).r) {return this.$find_by_id(selector.$slice(1,selector.$length()));
}else {return this.const_get('Element').$find_in_context(selector,this);
}},true, 59);
this.dm("find_by_id",function(id){return this.const_get('Element').$from_native(document.getElementById(id.$to_s()));
},true, 75);
this.is("@on_ready_actions",[]);
this.is("@__ready__",this.f);
this.dm("ready?",function(){if (arguments.length > 0 && arguments[0].info & this.TP) {  var __block__ = arguments[0];}if(((!__block__ || !__block__.r) ? this.f : this.t).r){if(this.ig('@__ready__').r){this.rbYield(__block__,[]);
}else{this.ig('@on_ready_actions')['$<<'](__block__);
}}else{this.n;}return this.ig('@__ready__');
},true, 83);
this.dm("__make_ready",function(){this.is("@__ready__",this.t);
return this.ig('@on_ready_actions').$each(this.P(function(action){return action.$call();
}));
},true, 99);
this.dm("body",function(){return this.const_get('Element').$from_native(document.body);
},true, 110);
this.dm("traverse",function(element,path,stop_state,all){var result = [];
    var working = element.__element__[path];
    while (working && (working.nodeType == 1)) {
      //console.log("working is:");
      //console.log(working);
      if (!all.r) {
        return this.const_get('Element').$from_native(working);
      } else {
        result.push(this.const_get('Element').$from_native(working));
      }
      working = working[path];
    }
    return result},true, 122);
opal.setDocumentReadyListener(function() {
    this.const_get('Document').$__make_ready();
  });this.__element__ = document;},2);
}),
    "lib/browser/element/attributes.rb": (function(__FILE__){return this.define_class(this.n,"Element",function(){this.dm("data",function(){return this.o(this.ig('@data'),function(){return this.is("@data",this.const_get('DataAttributeAccessor').$new(this));
});
},false, 47);
return this.define_class(this.n,"DataAttributeAccessor",function(){this.dm("initialize",function(element){this.is("@element",element);
this.__element__ = element.__element__;},false, 53);
this.dm("[]",function(key){return this.n;
},false, 62);
this.dm("[]=",function(key,value){return this.n;
},false, 70);
this.dm("has_key?",function(key){return this.f;
},false, 74);
this.dm("include?",function(key){return this['$has_key?'](key);
},false, 78);
return this.dm("member?",function(key){return this['$has_key?'](key);
},false, 82);
},0);
},0);
}),
    "lib/browser/element/css.rb": (function(__FILE__){return this.define_class(this.n,"Element",function(){this.dm("css",function(element, name, value){if (value == undefined) {  value = this.f;}var style = this.n;name=name.$to_s();
style=element.__element__.style || element.__element__;
name=name.replace(/[_-]\D/g, function(res) {
      return res.charAt(1).toUpperCase();
    });;
if(value['$=='](this.f).r){return style[name] || "";}else{return style[name] = value;}},true, 40);
this.dm("css",function(styles){if (styles == undefined) {  styles = this.n;}var $a = this.n;$a = styles;if(this.n['$===']($a).r) {return this.o(this.ig('@style'),function(){return this.is("@style",this.const_get('StyleDeclaration').$new(this));
});
}else if(this.const_get('Hash')['$===']($a).r) {return styles.$each(this.P(function(style,value){return this.const_get('Element').$css(this,style,value);
}));
}else if(this.const_get('String')['$===']($a).r || this.const_get('Symbol')['$===']($a).r) {return this.const_get('Element').$css(this,styles);
}else {return this.n;}},false, 64);
this.$alias_method(this.Y("style"),this.Y("css"));
this.dm("has_class?",function(class_name){return this.$class_name().$__contains__(class_name.$to_s()," ");
},false, 93);
this.dm("add_class",function(class_name){if(!this['$has_class?'](class_name).r){this['$class_name='](this.$class_name()['$+']([" ",class_name.$to_s()].join('')));
}else{this.n;}return this;
},false, 102);
this.dm("add_classes",function(class_names){class_names=Array.prototype.slice.call(arguments);class_names.$each(this.P(function(class_name){return this.$add_class(class_name);
}));
return this;
},false, 111);
this.dm("remove_class",function(class_name){class_name=class_name.$to_s();
this.__element__.className = this.$class_name().replace(new RegExp('(^|\\s)' + class_name + '(?:\\s|$)'), '$1');return this;
},false, 122);
this.dm("toggle_class",function(class_name){class_name=class_name.$to_s();
(this['$has_class?'](class_name)).r ? this.$remove_class(class_name) : this.$add_class(class_name);
return this;
},false, 133);
this.$alias_method(this.Y("__class__"),this.Y("class"));
this.dm("class_name=",function(class_name){this.__element__.className = class_name.toString();return this;
},false, 147);
this.$alias_method(this.Y('class='),this.Y("class_name="));
this.dm("class",function(){return this.__element__.className || "";},false, 158);
this.$alias_method(this.Y("class_name"),this.Y("class"));
this.dm("set_class_names",function(class_names){var current = this.n;current=this.$class_name().$split(" ");
class_names.$each(this.P(function(name,flag){if(current['$include?'](name).r){if(!flag.r){return current.$delete(name);
}else{return this.n;}}else{if(flag.r){return current['$<<'](name);
}else{return this.n;}}}));
return this['$class_name='](current.$join(" "));
},false, 165);
this.dm("visible?",function(){return this.const_get('Element').$css(this,"display")['$!=']("none");
},false, 197);
this.dm("hidden?",function(){return this.const_get('Element').$css(this,"display")['$==']("none");
},false, 215);
this.dm("hide",function(){this.const_get('Element').$css(this,this.Y("display"),"none");
return this;
},false, 231);
this.dm("show",function(){this.const_get('Element').$css(this,this.Y("display"),"");
return this;
},false, 248);
this.dm("toggle",function(){(this['$visible?']()).r ? this.$hide() : this.$show();
return this;
},false, 258);
this.dm("opacity=",function(opacity){return this.$raise("not implemented");
},false, 266);
return this.define_class(this.n,"StyleDeclaration",function(){this.dm("initialize",function(element){this.__element__ = element.__element__;this.__style__ = element.__element__.style || element.__element__;},false, 277);
this.dm("[]",function(style_name){return this.const_get('Element').$css(this,style_name);
},false, 282);
return this.dm("[]=",function(style_name,value){return this.const_get('Element').$css(this,style_name,value);
},false, 286);
},0);
},0);
}),
    "lib/browser/element/form.rb": (function(__FILE__){return this.define_class(this.n,"Element",function(){this.dm("disable",function(){this.__element__.disabled = true;return this;
},false, 35);
this.dm("enable",function(){this.__element__.disabled = false;return this;
},false, 44);
this.dm("enabled=",function(flag){return (flag).r ? this.$enable() : this.$disable();
},false, 53);
this.dm("enabled?",function(){return this.__element__.disabled ? this.f : this.t;},false, 60);
this.dm("disabled?",function(){return this.__element__.disabled ? this.t : this.f;},false, 67);
this.dm("focus",function(){this.__element__.focus();return this;
},false, 74);
this.dm("select",function(){this.__element__.select();return this;
},false, 82);
this.dm("value=",function(value){var elem = this.__element__, tag = elem.tagName.toLowerCase();
    if (tag === 'input') {
      var type = this.__element__.type.toLowerCase();
      if (type == 'checkbox' || type == 'radio') {
        throw "need to handle checkbox/radio";
      } else {
        this.__element__.value = value;
      }
    } else if (tag == 'textarea') {
      elem.value = value;
    }return value;
},false, 87);
this.dm("value",function(){var elem = this.__element__, tag = elem.tagName.toLowerCase();
    if (tag == 'input') {
      var type = elem.type.toLowerCase();
      if (type == 'checkbox' || type == 'radio') {
        throw "need to handle checkbox.radio"
      } else {
        return elem.value;
      }
    } else if (tag == 'textarea') {
      return elem.value;
    }
    },false, 107);
this.dm("checked?",function(){return this.__element__.checked ? this.t : this.f;},false, 127);
this.dm("on?",function(){return this['$checked?']();
},false, 132);
this.dm("off?",function(){return this['$checked?']()['$!']();
},false, 137);
return this.dm("checked=",function(flag){return this.n;},false, 141);
},0);
}),
    "lib/browser/element.rb": (function(__FILE__){this.define_class(this.n,"Element",function(){this.dm("initialize",function(type, options){if (options == undefined) {  options = vnH();}if (!options) { options = vnH()}this.__element__ = document.createElement(type.$to_s());return this.$set(options);
},false, 46);
this.dm("from_native",function(native_element){var element = this.n;if(!native_element) return this.n;element=this.$allocate();
element.__element__ = native_element;return element;
},true, 64);
this.dm("body",function(){if(this.ig('@body_element').r){return this.ig('@body_element');
}else{this.n;}this.is("@body_element",this.$from_native(document.body));
return this.ig('@body_element');
},true, 78);
this.dm("find_in_context",function(selector,context){var elements = this.n;if(selector['$is_a?'](this.const_get('Symbol')).r){selector='#' + selector.$to_s();
}else{this.n;}elements=Sizzle(selector, context.__element__);;
return elements.$map(this.P(function(e){return this.$from_native(e);
}));
},true, 98);
this.dm("find",function(selector){return this.$class().$find_in_context(selector,this);
},false, 113);
this.dm("tag",function(){return this.o(this.ig('@tag'),function(){return this.is("@tag",this.Y(this.__element__.tagName.toLowerCase()));
});
},false, 127);
this.dm("html=",function(html){this.__element__.innerHTML = html;return this;
},false, 146);
this.dm("text",function(){var e = this.__element__;
    return e.innerText == null ? e.textContent : e.innerText;},false, 160);
this.dm("text=",function(text){var e = this.__element__;
    if (e.textContent !== undefined) {
      e.textContent = text.toString();
    }
    else {
      e.innerText = text.toString();
    }return this;
},false, 178);
this.$alias_method(this.Y("content="),this.Y("text="));
this.dm("id=",function(id){this.__element__.id = id.$to_s();return this;
},false, 204);
this.dm("id",function(){return this.__element__.id || this.n;},false, 220);
this.dm("body?",function(){return this.f;
},false, 231);
this.dm("inspect",function(){var description = this.n;description=[["#<Element ",this.$tag().$to_s()].join('')];
if(!this.$class_name()['$==']("").r){description['$<<']([" class_name='",this.$class_name().$to_s(),"'"].join(''));
}else{this.n;}if(!this.$id()['$==']("").r){description['$<<']([" id='",this.$id().$to_s(),"'"].join(''));
}else{this.n;}description['$<<'](">");
return description.$join("");
},false, 235);
this.dm("set",function(options){return options.$each(this.P(function(key,value){return this.$__send__([key.$to_s(),"="].join(''),value);
}));
},false, 257);
this.dm("<<",function(element){return this.$append(element);
},false, 271);
this.dm("append",function(element){this.__element__.appendChild(element.__element__);return this;
},false, 279);
this.dm("before",function(element){var parent = this.__element__.parentNode;
    if (parent) {
      parent.insertBefore(element.__element__, this.__element__);
    }return this;
},false, 288);
this.dm("after",function(element){var parent = this.__element__.parentNode;
    if (parent) {
      parent.insertBefore(element.__element__, this.__element__.nextSibling);
    }return this;
},false, 300);
this.dm("remove",function(){var e = this.__element__;
    if (e.parentNode) {
      e.parentNode.removeChild(e);
    }return this;
},false, 325);
this.dm("destroy",function(){return this.$remove();
},false, 337);
this.dm("empty?",function(){return /^\s*$/.test(this.__element__.innerHTML) ? this.t : this.f;},false, 361);
this.dm("clear",function(){var e = this.__element__;
    for (var children = e.childNodes, i = children.length; i > 0;) {
      var child = children[--i];
      if (child.parentNode) {
        child.parentNode.removeChild(child);
      }
    }return this;
},false, 383);
this.dm("context",function(){return this.const_get('CanvasContext').$new(this);
},false, 400);
this.dm("parent",function(selector){if (selector == undefined) {  selector = this.n;}return this.const_get('Document').$traverse(this,"parentNode",this.n,this.f);
},false, 413);
this.dm("parents",function(selector){if (selector == undefined) {  selector = this.n;}return this.const_get('Document').$traverse(this,"parentNode",this.n,this.t);
},false, 417);
this.dm("next",function(selector){if (selector == undefined) {  selector = this.n;}return this.const_get('Document').$traverse(this,"nextSibling",this.n,this.f);
},false, 421);
this.dm("prev",function(selector){if (selector == undefined) {  selector = this.n;}return this.const_get('Document').$traverse(this,"previousSibling",this.n,this.f);
},false, 425);
this.dm("first",function(selector){if (selector == undefined) {  selector = this.n;}return this.const_get('Document').$traverse(this,"firstChild",this.n,this.f);
},false, 429);
this.dm("last",function(selector){if (selector == undefined) {  selector = this.n;}return this.const_get('Document').$traverse(this,"lastChild",this.n,this.f);
},false, 433);
this.dm("<<",function(elem){this.$append(elem);
return this;
},false, 440);
this.dm("element_offset",function(){var left = this.n,top = this.n;left=0;
top=0;
var element = this.__element__;
    var parent = element;
    while (parent) {
      left += parent.offsetLeft;
      top += parent.offsetTop;
      parent = parent.offsetParent;
    }
    return this.const_get('Point').$new(left,top);
},false, 450);
this.const_set("VALID_HTML_TAGS",[this.Y("html"),this.Y("head"),this.Y("title"),this.Y("base"),this.Y("meta"),this.Y("link"),this.Y("style"),this.Y("script"),this.Y("body"),this.Y("div"),this.Y("dl"),this.Y("dt"),this.Y("dd"),this.Y("span"),this.Y("pre")]);
return this.const_get('VALID_HTML_TAGS').$each(this.P(function(tag_name){return this.$define_method(tag_name,this.P(function(options){var e = this.n;e=this.const_get('Element').$new(tag_name,options);
this['$<<'](e);
return e;
}));
}));
},0);
this.$require("browser/element/attributes");
this.$require("browser/element/css");
return this.$require("browser/element/form");
}),
    "lib/browser/event/dom_events.rb": (function(__FILE__){this.define_class(this.n,"Event",function(){return this.define_class(this.n,'DOMEvents',function(){this.dm("on",function(event_name){var __block__ = 
              (arguments[1] && arguments[1].info & this.TP)
              ? arguments[1] : this.n;var event_class = this.n;event_class=this.const_get('Event');
var func = function(evt) {
        //console.log(event_class);
        evt = event_class.$from_native(evt);
        var res = __block__.apply(__block__.__self__, [evt]);
        return (res !==undefined && res.r);
      };
      
      var element = this.__element__;
      if (element.addEventListener) {
        element.addEventListener(event_name.$to_s(), func, false);
      } else {
        element.attachEvent('on' + event_name.$to_s(), func);
      }return this;
},false, 38);
return ['mousedown', 'mouseup', 'mousemove'].$each(this.P(function(event_name){return this.$define_method(event_name,this.P(function(){if (arguments[0] && arguments[0].info & this.TP) {
          return this.$on(event_name, arguments[0]);
        } else {
          return console.log("need to fire event: " + event_name);
        }}));
}));
},2);
},0);
this.const_get('Element').$include(this.const_get('Event').const_get("DOMEvents"));
return this.const_get('Document').$extend(this.const_get('Event').const_get("DOMEvents"));
}),
    "lib/browser/event/event.rb": (function(__FILE__){this.define_class(this.n,"Event",function(){this.dm("from_native",function(event){var result = this.n;result=this.$allocate();
event = event || window.event;
    
    var type = event.type,
        target = event.target || event.srcElement,
        code = event.which || event.keyCode,
        key = this.const_get('Event').const_get("KEYS")['$[]'](code);
    
    if (!key.r) {
      key = this.Y(String.fromCharCode(code).toLowerCase());
    }
    
    while (target && target.nodeType == 3) {
      target = target.parentNode;
    }
    
    result.__shift__ = event.shiftKey ? this.t : this.f;
    result.__alt__ = event.altKey ? this.t : this.f;
    result.__ctrl__ = event.ctrlKey ? this.t : this.f;
    result.__meta__ = event.metaKey ? this.t : this.f;
    
    result.__code__ = code;
    result.__key__ = key;
    result.__event__ = event;
    result.__type__ = type;return result;
},true, 35);
this.dm("stop_propagation",function(){var evt = this.__event__;
    if (evt.stopPropagation) {
      evt.stopPropagation();
    } else {
      evt.cancelBubble = true;
    }return this;
},false, 67);
this.dm("prevent_default",function(){var evt = this.__event__;
    if (evt.preventDefault) {
      evt.preventDefault();
    } else {
      evt.returnValue = false;
    }return this;
},false, 80);
this.dm("stop!",function(){this.$stop_propagation();
return this.$prevent_default();
},false, 93);
this.dm("type",function(){if(this.ig('@type').r){return this.ig('@type');
}else{this.is("@type",vnY(this.__event__.type));
return this.ig('@type');
}},false, 101);
this.dm("type=",function(event_type){return this.is("@type",event_type);
},false, 115);
this.const_set("KEYS",vnH(8,this.Y("backspace"),9,this.Y("tab"),13,this.Y("enter"),27,this.Y("escape"),32,this.Y("space"),37,this.Y("left"),38,this.Y("up"),39,this.Y("right"),40,this.Y("down"),46,this.Y("delete")));
this.dm("key",function(){return this.__key__ || this.n;},false, 142);
this.dm("shift?",function(){return this.__shift__;},false, 149);
this.dm("alt?",function(){return this.__alt__;},false, 156);
this.dm("ctrl?",function(){return this.__ctrl__;},false, 163);
return this.dm("meta?",function(){return this.__meta__;},false, 170);
},0);
this.$require("browser/event/trigger_events");
return this.$require("browser/event/dom_events");
}),
    "lib/browser/event/trigger_events.rb": (function(__FILE__){return this.define_class(this.n,"Event",function(){return this.define_class(this.n,'TriggerEvents',function(){this.dm("on",function(name){var __block__ = 
              (arguments[1] && arguments[1].info & this.TP)
              ? arguments[1] : this.n;name=name.$to_sym();
this.is("@trigger_events",this.o(this.ig('@trigger_events'),function(){return vnH();
}));
this.o(this.ig('@trigger_events')['$[]'](name),function(){return this.ig('@trigger_events')['$[]='](name,[__block__]);
});
return this;
},false, 32);
return this.dm("trigger",function(name,args){name=arguments[0];args=Array.prototype.slice.call(arguments,1);var listeners = this.n;this.$puts(["triggering ",name.$to_s()].join(''));
name=name.$to_sym();
if(this.a(this.ig('@trigger_events'),function(){return listeners=this.ig('@trigger_events')['$[]'](name);
}).r){listeners.$each(this.P(function(listener){return listener.$call(args['$[]'](0),args['$[]'](1),args['$[]'](2));
}));
}else{this.n;}return this;
},false, 40);
},2);
},0);
}),
    "lib/browser/geometry.rb": (function(__FILE__){this.define_class(this.n,"Point",function(){this.$attr_accessor(this.Y("x"),this.Y("y"));
return this.dm("initialize",function(x,y){this.is("@x",x);
return this.is("@y",y);
},false, 31);
},0);
this.define_class(this.n,"Size",function(){this.$attr_accessor(this.Y("height"),this.Y("width"));
this.dm("initialize",function(w,h){this.is("@width",w);
return this.is("@height",h);
},false, 41);
return this.dm("inspect",function(){return ["#<Size ",this.ig('@width').$to_s(),", ",this.ig('@height').$to_s(),">"].join('');
},false, 46);
},0);
return this.define_class(this.n,"Rect",function(){this.$attr_accessor(this.Y("size"),this.Y("origin"));
this.dm("initialize",function(x,y,w,h){this.is("@origin",this.const_get('Point').$new(x,y));
return this.is("@size",this.const_get('Size').$new(w,h));
},false, 55);
this.dm("x",function(){return this.$origin().$x();
},false, 60);
this.dm("x=",function(x){return this.$origin()['$x='](x);
},false, 64);
this.dm("y",function(){return this.$origin().$y();
},false, 68);
this.dm("y=",function(y){return this.$origin()['$y='](y);
},false, 72);
this.dm("width",function(){return this.$size().$width();
},false, 76);
this.dm("width=",function(width){return this.$size()['$width='](width);
},false, 80);
this.dm("height",function(){return this.$size().$height();
},false, 84);
this.dm("height=",function(height){return this.$size()['$height='](height);
},false, 88);
return this.dm("contains_point?",function(point){var res = (this.$x() < point.$x()) && (this.$y() < point.$y()) && ((this.$x() + this.$width()) > point.$x()) && ((this.$y() + this.$height()) > point.$y());
    return res ? this.t : this.f;
    },false, 92);
},0);
}),
    "lib/browser/json.rb": (function(__FILE__){return this.define_class(this.n,'JSON',function(){return this.dm("parse",function(text){if (text == undefined) {  text = "";}if(text['$==']("").r){return this.$raise("JSON.parse empty string");
}else{return this.n;}},true, 29);
},2);
}),
    "lib/browser/request/request.rb": (function(__FILE__){this.$require("browser/event/trigger_events");
return this.define_class(this.n,"Request",function(){this.$include(this.const_get('Event').const_get("TriggerEvents"));
this.const_set("OPTIONS",vnH(this.Y("url"),"",this.Y("data"),vnH(),this.Y("async"),this.t,this.Y("format"),this.n,this.Y("method"),"POST",this.Y("link"),"ignore",this.Y("is_success"),this.n,this.Y("emulation"),this.t,this.Y("url_encoded"),this.t,this.Y("encoding"),"utf-8",this.Y("eval_scripts"),this.f,this.Y("eval_response"),this.f,this.Y("timeout"),0,this.Y("no_cache"),this.f));
this.$attr_reader(this.Y("status"));
this.$attr_reader(this.Y("text"));
this.dm("initialize",function(options){if (options == undefined) {  options = vnH();}this.__xhr__ = opal.request();this.is("@options",this.const_get('OPTIONS').$merge(options));
this.is("@headers",this.ig('@options')['$[]'](this.Y("headers")));
this.is("@running",this.f);
this.is("@status",0);
return this.is("@text","");
},false, 84);
['get', 'post', 'put', 'delete', 'GET', 'POST', 'PUT', 'DELETE'].$each(this.P(function(method){return this.$define_method(method,this.P(function(data){return this.$send(vnH(this.Y("data"),data,this.Y("method"),method));
}));
}));
this.dm("send",function(options){if (options == undefined) {  options = vnH();}var __block__ = 
              (arguments[1] && arguments[1].info & this.TP)
              ? arguments[1] : this.n;var method = this.n,url = this.n,request = this.n;this.is("@running",this.t);
method=this.Y("post");
url=this.o(options['$[]'](this.Y("url")),function(){return "";
});
request=this;
this.__xhr__.onreadystatechange = function() {
      request.$state_change();
    };this.__xhr__.open(method.$to_s().toUpperCase(), url, true);this.$trigger(this.Y("request"),this);
this.__xhr__.send(null);},false, 108);
this.dm("running?",function(){return this.ig('@running');
},false, 137);
this.dm("success?",function(){return (this.ig('@status') >= 200 && this.ig('@status') < 300) ? this.t : this.f;},false, 144);
this.dm("failed?",function(){return this['$success?']()['$!']();
},false, 151);
this.dm("state_change",function(){var e = this.n;if (this.__xhr__.readyState !== 4 || !this.ig('@running').r) return;this.__xhr__.onreadystatechange = function() { };this.is("@running",this.f);
this.is("@status",0);
try{this.is("@status",this.__xhr__.status);
}catch(e) {
            if (e.mid2jsid) {
              e = e;
            } else {
              e = this.rbNativeError(e);
            }
          this.$puts("warning");
}this.$puts(["our status is now ",this.ig('@status').$to_s()].join(''));
if(this['$success?']().r){this.is("@text",this.__xhr__.responseText || '');
this.$trigger(this.Y("success"),this);
return this.$trigger(this.Y("complete"),this);
}else{console.log(this.ig('@status'));this.$puts(["aww :( ",this.ig('@status').$to_s()].join(''));
this.$trigger(this.Y("failure"),this);
return this.$trigger(this.Y("complete"),this);
}},false, 155);
return this.dm("cancel",function(){if(!this.ig('@running').r){return this;
}else{this.n;}this.is("@running",this.f);
this.__xhr__.abort();this.__xhr__.onreadystatechange = function() {};this.__xhr__ = opal.request();this.$trigger(this.Y("cancel"));
return this;
},false, 191);
},0);
}),
    "lib/browser/string.rb": (function(__FILE__){return this.define_class(this.n,"String",function(){return this.dm("__contains__",function(str, sep){if (sep == undefined) {  sep = "";}if ((sep + this + sep).indexOf(sep + str + sep) > -1) {
      return this.t;
    } else {
      return this.f;
    }},false, 35);
},0);
}),
    "lib/browser/touch.rb": (function(__FILE__){return this.define_class(this.n,"Event",function(){return this.dm("changed_touches",function(){if(this.ig('@changed_touches').r){return this.ig('@changed_touches');
}else{this.n;}return this.is("@changed_touches",this.__event__.changedTouches.$map(this.P(function(touch){this.const_get('Touch').$from_native(touch);})));
},false, 30);
},0);
}),
    "lib/browser/window.rb": (function(__FILE__){return this.define_class(this.n,"Window",function(){this.dm("window",function(){return this;
},true, 29);
return this.dm("document",function(){return this.const_get('Document');
},true, 33);
},0);
}),
    "lib/browser.rb": (function(__FILE__){this.define_class(this.n,'Browser',function(){this.dm("opera?",function(){return this.o(this.ig('@__is_opera__'),function(){return this.is("@__is_opera__",(opal.browser.opera ? this.t : this.f));
});
},true, 35);
this.dm("safari?",function(){return this.o(this.ig('@__is_safari__'),function(){return this.is("@__is_safari__",(opal.browser.safari ? this.t : this.f));
});
},true, 42);
this.dm("msie?",function(){return this.o(this.ig('@__is_msie__'),function(){return this.is("@__is_msie__",(opal.browser.msie ? this.t : this.f));
});
},true, 50);
this.dm("firefox?",function(){return this.o(this.ig('@__is_firefox__'),function(){return this.is("@__is_firefox__",(opal.browser.firefox ? this.t : this.f));
});
},true, 57);
this.dm("touch?",function(){return this.o(this.ig('@__is_touch__'),function(){return this.is("@__is_touch__",(('createTouch' in document) ? this.t : this.f));
});
},true, 63);
this.dm("document",function(){if(this.ig('@document_element').r){return this.ig('@document_element');
}else{this.n;}this.is("@document_element",this.const_get('Element').$from_native(document));
return this.ig('@document_element');
},true, 75);
this.dm("window",function(){if(this.ig('@window_element').r){return this.ig('@window_element');
}else{this.n;}this.is("@window_element",this.const_get('Element').$from_native(window));
return this.ig('@window_element');
},true, 87);
return this.dm("alert",function(message){if (message == undefined) {  message = "";}return alert(message);},true, 98);
},2);
this.$require("browser/string");
this.$require("browser/window");
this.$require("browser/document");
this.$require("browser/sizzle.js");
this.$require("browser/element");
this.$require("browser/event/event");
this.$require("browser/geometry");
this.$require("browser/request/request");
this.$require("browser/builder");
this.$require("browser/canvas_context");
this.$require("browser/vml_context.js");
this.$require("browser/dimensions");
return this.$require("browser/touch");
}),
    "lib/browser/json_parse.js": function() {if (!this.JSON) {
    this.JSON = {};
}

(function () {

    function f(n) {
        // Format integers to have at least two digits.
        return n < 10 ? '0' + n : n;
    }

    if (typeof Date.prototype.toJSON !== 'function') {

        Date.prototype.toJSON = function (key) {

            return isFinite(this.valueOf()) ?
                   this.getUTCFullYear()   + '-' +
                 f(this.getUTCMonth() + 1) + '-' +
                 f(this.getUTCDate())      + 'T' +
                 f(this.getUTCHours())     + ':' +
                 f(this.getUTCMinutes())   + ':' +
                 f(this.getUTCSeconds())   + 'Z' : null;
        };

        String.prototype.toJSON =
        Number.prototype.toJSON =
        Boolean.prototype.toJSON = function (key) {
            return this.valueOf();
        };
    }

    var cx = /[\u0000\u00ad\u0600-\u0604\u070f\u17b4\u17b5\u200c-\u200f\u2028-\u202f\u2060-\u206f\ufeff\ufff0-\uffff]/g,
        escapable = /[\\\"\x00-\x1f\x7f-\x9f\u00ad\u0600-\u0604\u070f\u17b4\u17b5\u200c-\u200f\u2028-\u202f\u2060-\u206f\ufeff\ufff0-\uffff]/g,
        gap,
        indent,
        meta = {    // table of character substitutions
            '\b': '\\b',
            '\t': '\\t',
            '\n': '\\n',
            '\f': '\\f',
            '\r': '\\r',
            '"' : '\\"',
            '\\': '\\\\'
        },
        rep;


    function quote(string) {

// If the string contains no control characters, no quote characters, and no
// backslash characters, then we can safely slap some quotes around it.
// Otherwise we must also replace the offending characters with safe escape
// sequences.

        escapable.lastIndex = 0;
        return escapable.test(string) ?
            '"' + string.replace(escapable, function (a) {
                var c = meta[a];
                return typeof c === 'string' ? c :
                    '\\u' + ('0000' + a.charCodeAt(0).toString(16)).slice(-4);
            }) + '"' :
            '"' + string + '"';
    }


    function str(key, holder) {

// Produce a string from holder[key].

        var i,          // The loop counter.
            k,          // The member key.
            v,          // The member value.
            length,
            mind = gap,
            partial,
            value = holder[key];

// If the value has a toJSON method, call it to obtain a replacement value.

        if (value && typeof value === 'object' &&
                typeof value.toJSON === 'function') {
            value = value.toJSON(key);
        }

// If we were called with a replacer function, then call the replacer to
// obtain a replacement value.

        if (typeof rep === 'function') {
            value = rep.call(holder, key, value);
        }

// What happens next depends on the value's type.

        switch (typeof value) {
        case 'string':
            return quote(value);

        case 'number':

// JSON numbers must be finite. Encode non-finite numbers as null.

            return isFinite(value) ? String(value) : 'null';

        case 'boolean':
        case 'null':

// If the value is a boolean or null, convert it to a string. Note:
// typeof null does not produce 'null'. The case is included here in
// the remote chance that this gets fixed someday.

            return String(value);

// If the type is 'object', we might be dealing with an object or an array or
// null.

        case 'object':

// Due to a specification blunder in ECMAScript, typeof null is 'object',
// so watch out for that case.

            if (!value) {
                return 'null';
            }

// Make an array to hold the partial results of stringifying this object value.

            gap += indent;
            partial = [];

// Is the value an array?

            if (Object.prototype.toString.apply(value) === '[object Array]') {

// The value is an array. Stringify every element. Use null as a placeholder
// for non-JSON values.

                length = value.length;
                for (i = 0; i < length; i += 1) {
                    partial[i] = str(i, value) || 'null';
                }

// Join all of the elements together, separated with commas, and wrap them in
// brackets.

                v = partial.length === 0 ? '[]' :
                    gap ? '[\n' + gap +
                            partial.join(',\n' + gap) + '\n' +
                                mind + ']' :
                          '[' + partial.join(',') + ']';
                gap = mind;
                return v;
            }

// If the replacer is an array, use it to select the members to be stringified.

            if (rep && typeof rep === 'object') {
                length = rep.length;
                for (i = 0; i < length; i += 1) {
                    k = rep[i];
                    if (typeof k === 'string') {
                        v = str(k, value);
                        if (v) {
                            partial.push(quote(k) + (gap ? ': ' : ':') + v);
                        }
                    }
                }
            } else {

// Otherwise, iterate through all of the keys in the object.

                for (k in value) {
                    if (Object.hasOwnProperty.call(value, k)) {
                        v = str(k, value);
                        if (v) {
                            partial.push(quote(k) + (gap ? ': ' : ':') + v);
                        }
                    }
                }
            }

// Join all of the member texts together, separated with commas,
// and wrap them in braces.

            v = partial.length === 0 ? '{}' :
                gap ? '{\n' + gap + partial.join(',\n' + gap) + '\n' +
                        mind + '}' : '{' + partial.join(',') + '}';
            gap = mind;
            return v;
        }
    }

// If the JSON object does not yet have a stringify method, give it one.

    if (typeof JSON.stringify !== 'function') {
        JSON.stringify = function (value, replacer, space) {

// The stringify method takes a value and an optional replacer, and an optional
// space parameter, and returns a JSON text. The replacer can be a function
// that can replace values, or an array of strings that will select the keys.
// A default replacer method can be provided. Use of the space parameter can
// produce text that is more easily readable.

            var i;
            gap = '';
            indent = '';

// If the space parameter is a number, make an indent string containing that
// many spaces.

            if (typeof space === 'number') {
                for (i = 0; i < space; i += 1) {
                    indent += ' ';
                }

// If the space parameter is a string, it will be used as the indent string.

            } else if (typeof space === 'string') {
                indent = space;
            }

// If there is a replacer, it must be a function or an array.
// Otherwise, throw an error.

            rep = replacer;
            if (replacer && typeof replacer !== 'function' &&
                    (typeof replacer !== 'object' ||
                     typeof replacer.length !== 'number')) {
                throw new Error('JSON.stringify');
            }

// Make a fake root object containing our value under the key of ''.
// Return the result of stringifying the value.

            return str('', {'': value});
        };
    }


// If the JSON object does not yet have a parse method, give it one.

    if (typeof JSON.parse !== 'function') {
        JSON.parse = function (text, reviver) {

// The parse method takes a text and an optional reviver function, and returns
// a JavaScript value if the text is a valid JSON text.

            var j;

            function walk(holder, key) {

// The walk method is used to recursively walk the resulting structure so
// that modifications can be made.

                var k, v, value = holder[key];
                if (value && typeof value === 'object') {
                    for (k in value) {
                        if (Object.hasOwnProperty.call(value, k)) {
                            v = walk(value, k);
                            if (v !== undefined) {
                                value[k] = v;
                            } else {
                                delete value[k];
                            }
                        }
                    }
                }
                return reviver.call(holder, key, value);
            }


// Parsing happens in four stages. In the first stage, we replace certain
// Unicode characters with escape sequences. JavaScript handles many characters
// incorrectly, either silently deleting them, or treating them as line endings.

            text = String(text);
            cx.lastIndex = 0;
            if (cx.test(text)) {
                text = text.replace(cx, function (a) {
                    return '\\u' +
                        ('0000' + a.charCodeAt(0).toString(16)).slice(-4);
                });
            }

// In the second stage, we run the text against regular expressions that look
// for non-JSON patterns. We are especially concerned with '()' and 'new'
// because they can cause invocation, and '=' because it can cause mutation.
// But just to be safe, we want to reject all unexpected forms.

// We split the second stage into 4 regexp operations in order to work around
// crippling inefficiencies in IE's and Safari's regexp engines. First we
// replace the JSON backslash pairs with '@' (a non-JSON character). Second, we
// replace all simple value tokens with ']' characters. Third, we delete all
// open brackets that follow a colon or comma or that begin the text. Finally,
// we look to see that the remaining characters are only whitespace or ']' or
// ',' or ':' or '{' or '}'. If that is so, then the text is safe for eval.

            if (/^[\],:{}\s]*$/
.test(text.replace(/\\(?:["\\\/bfnrt]|u[0-9a-fA-F]{4})/g, '@')
.replace(/"[^"\\\n\r]*"|true|false|null|-?\d+(?:\.\d*)?(?:[eE][+\-]?\d+)?/g, ']')
.replace(/(?:^|:|,)(?:\s*\[)+/g, ''))) {

// In the third stage we use the eval function to compile the text into a
// JavaScript structure. The '{' operator is subject to a syntactic ambiguity
// in JavaScript: it can begin a block or an object literal. We wrap the text
// in parens to eliminate the ambiguity.

                j = eval('(' + text + ')');

// In the optional fourth stage, we recursively walk the new structure, passing
// each name/value pair to a reviver function for possible transformation.

                return typeof reviver === 'function' ?
                    walk({'': j}, '') : j;
            }

// If the text is not JSON parseable, then a SyntaxError is thrown.

            throw new SyntaxError('JSON.parse');
        };
    }
}());},
    "lib/browser/sizzle.js": function() {/*!
 * Sizzle CSS Selector Engine - v1.0
 *  Copyright 2009, The Dojo Foundation
 *  Released under the MIT, BSD, and GPL Licenses.
 *  More information: http://sizzlejs.com/
 */
(function(){

var chunker = /((?:\((?:\([^()]+\)|[^()]+)+\)|\[(?:\[[^\[\]]*\]|['"][^'"]*['"]|[^\[\]'"]+)+\]|\\.|[^ >+~,(\[\\]+)+|[>+~])(\s*,\s*)?((?:.|\r|\n)*)/g,
	done = 0,
	toString = Object.prototype.toString,
	hasDuplicate = false,
	baseHasDuplicate = true;

// Here we check if the JavaScript engine is using some sort of
// optimization where it does not always call our comparision
// function. If that is the case, discard the hasDuplicate value.
//   Thus far that includes Google Chrome.
[0, 0].sort(function(){
	baseHasDuplicate = false;
	return 0;
});

var Sizzle = function(selector, context, results, seed) {
	results = results || [];
	context = context || document;

	var origContext = context;

	if ( context.nodeType !== 1 && context.nodeType !== 9 ) {
		return [];
	}

	if ( !selector || typeof selector !== "string" ) {
		return results;
	}

	var parts = [], m, set, checkSet, extra, prune = true, contextXML = isXML(context),
		soFar = selector, ret, cur, pop, i;

	// Reset the position of the chunker regexp (start from head)
	do {
		chunker.exec("");
		m = chunker.exec(soFar);

		if ( m ) {
			soFar = m[3];

			parts.push( m[1] );

			if ( m[2] ) {
				extra = m[3];
				break;
			}
		}
	} while ( m );

	if ( parts.length > 1 && origPOS.exec( selector ) ) {
		if ( parts.length === 2 && Expr.relative[ parts[0] ] ) {
			set = posProcess( parts[0] + parts[1], context );
		} else {
			set = Expr.relative[ parts[0] ] ?
				[ context ] :
				Sizzle( parts.shift(), context );

			while ( parts.length ) {
				selector = parts.shift();

				if ( Expr.relative[ selector ] ) {
					selector += parts.shift();
				}

				set = posProcess( selector, set );
			}
		}
	} else {
		// Take a shortcut and set the context if the root selector is an ID
		// (but not if it'll be faster if the inner selector is an ID)
		if ( !seed && parts.length > 1 && context.nodeType === 9 && !contextXML &&
				Expr.match.ID.test(parts[0]) && !Expr.match.ID.test(parts[parts.length - 1]) ) {
			ret = Sizzle.find( parts.shift(), context, contextXML );
			context = ret.expr ? Sizzle.filter( ret.expr, ret.set )[0] : ret.set[0];
		}

		if ( context ) {
			ret = seed ?
				{ expr: parts.pop(), set: makeArray(seed) } :
				Sizzle.find( parts.pop(), parts.length === 1 && (parts[0] === "~" || parts[0] === "+") && context.parentNode ? context.parentNode : context, contextXML );
			set = ret.expr ? Sizzle.filter( ret.expr, ret.set ) : ret.set;

			if ( parts.length > 0 ) {
				checkSet = makeArray(set);
			} else {
				prune = false;
			}

			while ( parts.length ) {
				cur = parts.pop();
				pop = cur;

				if ( !Expr.relative[ cur ] ) {
					cur = "";
				} else {
					pop = parts.pop();
				}

				if ( pop == null ) {
					pop = context;
				}

				Expr.relative[ cur ]( checkSet, pop, contextXML );
			}
		} else {
			checkSet = parts = [];
		}
	}

	if ( !checkSet ) {
		checkSet = set;
	}

	if ( !checkSet ) {
		Sizzle.error( cur || selector );
	}

	if ( toString.call(checkSet) === "[object Array]" ) {
		if ( !prune ) {
			results.push.apply( results, checkSet );
		} else if ( context && context.nodeType === 1 ) {
			for ( i = 0; checkSet[i] != null; i++ ) {
				if ( checkSet[i] && (checkSet[i] === true || checkSet[i].nodeType === 1 && contains(context, checkSet[i])) ) {
					results.push( set[i] );
				}
			}
		} else {
			for ( i = 0; checkSet[i] != null; i++ ) {
				if ( checkSet[i] && checkSet[i].nodeType === 1 ) {
					results.push( set[i] );
				}
			}
		}
	} else {
		makeArray( checkSet, results );
	}

	if ( extra ) {
		Sizzle( extra, origContext, results, seed );
		Sizzle.uniqueSort( results );
	}

	return results;
};

Sizzle.uniqueSort = function(results){
	if ( sortOrder ) {
		hasDuplicate = baseHasDuplicate;
		results.sort(sortOrder);

		if ( hasDuplicate ) {
			for ( var i = 1; i < results.length; i++ ) {
				if ( results[i] === results[i-1] ) {
					results.splice(i--, 1);
				}
			}
		}
	}

	return results;
};

Sizzle.matches = function(expr, set){
	return Sizzle(expr, null, null, set);
};

Sizzle.find = function(expr, context, isXML){
	var set;

	if ( !expr ) {
		return [];
	}

	for ( var i = 0, l = Expr.order.length; i < l; i++ ) {
		var type = Expr.order[i], match;

		if ( (match = Expr.leftMatch[ type ].exec( expr )) ) {
			var left = match[1];
			match.splice(1,1);

			if ( left.substr( left.length - 1 ) !== "\\" ) {
				match[1] = (match[1] || "").replace(/\\/g, "");
				set = Expr.find[ type ]( match, context, isXML );
				if ( set != null ) {
					expr = expr.replace( Expr.match[ type ], "" );
					break;
				}
			}
		}
	}

	if ( !set ) {
		set = context.getElementsByTagName("*");
	}

	return {set: set, expr: expr};
};

Sizzle.filter = function(expr, set, inplace, not){
	var old = expr, result = [], curLoop = set, match, anyFound,
		isXMLFilter = set && set[0] && isXML(set[0]);

	while ( expr && set.length ) {
		for ( var type in Expr.filter ) {
			if ( (match = Expr.leftMatch[ type ].exec( expr )) != null && match[2] ) {
				var filter = Expr.filter[ type ], found, item, left = match[1];
				anyFound = false;

				match.splice(1,1);

				if ( left.substr( left.length - 1 ) === "\\" ) {
					continue;
				}

				if ( curLoop === result ) {
					result = [];
				}

				if ( Expr.preFilter[ type ] ) {
					match = Expr.preFilter[ type ]( match, curLoop, inplace, result, not, isXMLFilter );

					if ( !match ) {
						anyFound = found = true;
					} else if ( match === true ) {
						continue;
					}
				}

				if ( match ) {
					for ( var i = 0; (item = curLoop[i]) != null; i++ ) {
						if ( item ) {
							found = filter( item, match, i, curLoop );
							var pass = not ^ !!found;

							if ( inplace && found != null ) {
								if ( pass ) {
									anyFound = true;
								} else {
									curLoop[i] = false;
								}
							} else if ( pass ) {
								result.push( item );
								anyFound = true;
							}
						}
					}
				}

				if ( found !== undefined ) {
					if ( !inplace ) {
						curLoop = result;
					}

					expr = expr.replace( Expr.match[ type ], "" );

					if ( !anyFound ) {
						return [];
					}

					break;
				}
			}
		}

		// Improper expression
		if ( expr === old ) {
			if ( anyFound == null ) {
				Sizzle.error( expr );
			} else {
				break;
			}
		}

		old = expr;
	}

	return curLoop;
};

Sizzle.error = function( msg ) {
	throw "Syntax error, unrecognized expression: " + msg;
};

var Expr = Sizzle.selectors = {
	order: [ "ID", "NAME", "TAG" ],
	match: {
		ID: /#((?:[\w\u00c0-\uFFFF\-]|\\.)+)/,
		CLASS: /\.((?:[\w\u00c0-\uFFFF\-]|\\.)+)/,
		NAME: /\[name=['"]*((?:[\w\u00c0-\uFFFF\-]|\\.)+)['"]*\]/,
		ATTR: /\[\s*((?:[\w\u00c0-\uFFFF\-]|\\.)+)\s*(?:(\S?=)\s*(['"]*)(.*?)\3|)\s*\]/,
		TAG: /^((?:[\w\u00c0-\uFFFF\*\-]|\\.)+)/,
		CHILD: /:(only|nth|last|first)-child(?:\((even|odd|[\dn+\-]*)\))?/,
		POS: /:(nth|eq|gt|lt|first|last|even|odd)(?:\((\d*)\))?(?=[^\-]|$)/,
		PSEUDO: /:((?:[\w\u00c0-\uFFFF\-]|\\.)+)(?:\((['"]?)((?:\([^\)]+\)|[^\(\)]*)+)\2\))?/
	},
	leftMatch: {},
	attrMap: {
		"class": "className",
		"for": "htmlFor"
	},
	attrHandle: {
		href: function(elem){
			return elem.getAttribute("href");
		}
	},
	relative: {
		"+": function(checkSet, part){
			var isPartStr = typeof part === "string",
				isTag = isPartStr && !/\W/.test(part),
				isPartStrNotTag = isPartStr && !isTag;

			if ( isTag ) {
				part = part.toLowerCase();
			}

			for ( var i = 0, l = checkSet.length, elem; i < l; i++ ) {
				if ( (elem = checkSet[i]) ) {
					while ( (elem = elem.previousSibling) && elem.nodeType !== 1 ) {}

					checkSet[i] = isPartStrNotTag || elem && elem.nodeName.toLowerCase() === part ?
						elem || false :
						elem === part;
				}
			}

			if ( isPartStrNotTag ) {
				Sizzle.filter( part, checkSet, true );
			}
		},
		">": function(checkSet, part){
			var isPartStr = typeof part === "string",
				elem, i = 0, l = checkSet.length;

			if ( isPartStr && !/\W/.test(part) ) {
				part = part.toLowerCase();

				for ( ; i < l; i++ ) {
					elem = checkSet[i];
					if ( elem ) {
						var parent = elem.parentNode;
						checkSet[i] = parent.nodeName.toLowerCase() === part ? parent : false;
					}
				}
			} else {
				for ( ; i < l; i++ ) {
					elem = checkSet[i];
					if ( elem ) {
						checkSet[i] = isPartStr ?
							elem.parentNode :
							elem.parentNode === part;
					}
				}

				if ( isPartStr ) {
					Sizzle.filter( part, checkSet, true );
				}
			}
		},
		"": function(checkSet, part, isXML){
			var doneName = done++, checkFn = dirCheck, nodeCheck;

			if ( typeof part === "string" && !/\W/.test(part) ) {
				part = part.toLowerCase();
				nodeCheck = part;
				checkFn = dirNodeCheck;
			}

			checkFn("parentNode", part, doneName, checkSet, nodeCheck, isXML);
		},
		"~": function(checkSet, part, isXML){
			var doneName = done++, checkFn = dirCheck, nodeCheck;

			if ( typeof part === "string" && !/\W/.test(part) ) {
				part = part.toLowerCase();
				nodeCheck = part;
				checkFn = dirNodeCheck;
			}

			checkFn("previousSibling", part, doneName, checkSet, nodeCheck, isXML);
		}
	},
	find: {
		ID: function(match, context, isXML){
			if ( typeof context.getElementById !== "undefined" && !isXML ) {
				var m = context.getElementById(match[1]);
				return m ? [m] : [];
			}
		},
		NAME: function(match, context){
			if ( typeof context.getElementsByName !== "undefined" ) {
				var ret = [], results = context.getElementsByName(match[1]);

				for ( var i = 0, l = results.length; i < l; i++ ) {
					if ( results[i].getAttribute("name") === match[1] ) {
						ret.push( results[i] );
					}
				}

				return ret.length === 0 ? null : ret;
			}
		},
		TAG: function(match, context){
			return context.getElementsByTagName(match[1]);
		}
	},
	preFilter: {
		CLASS: function(match, curLoop, inplace, result, not, isXML){
			match = " " + match[1].replace(/\\/g, "") + " ";

			if ( isXML ) {
				return match;
			}

			for ( var i = 0, elem; (elem = curLoop[i]) != null; i++ ) {
				if ( elem ) {
					if ( not ^ (elem.className && (" " + elem.className + " ").replace(/[\t\n]/g, " ").indexOf(match) >= 0) ) {
						if ( !inplace ) {
							result.push( elem );
						}
					} else if ( inplace ) {
						curLoop[i] = false;
					}
				}
			}

			return false;
		},
		ID: function(match){
			return match[1].replace(/\\/g, "");
		},
		TAG: function(match, curLoop){
			return match[1].toLowerCase();
		},
		CHILD: function(match){
			if ( match[1] === "nth" ) {
				// parse equations like 'even', 'odd', '5', '2n', '3n+2', '4n-1', '-n+6'
				var test = /(-?)(\d*)n((?:\+|-)?\d*)/.exec(
					match[2] === "even" && "2n" || match[2] === "odd" && "2n+1" ||
					!/\D/.test( match[2] ) && "0n+" + match[2] || match[2]);

				// calculate the numbers (first)n+(last) including if they are negative
				match[2] = (test[1] + (test[2] || 1)) - 0;
				match[3] = test[3] - 0;
			}

			// TODO: Move to normal caching system
			match[0] = done++;

			return match;
		},
		ATTR: function(match, curLoop, inplace, result, not, isXML){
			var name = match[1].replace(/\\/g, "");

			if ( !isXML && Expr.attrMap[name] ) {
				match[1] = Expr.attrMap[name];
			}

			if ( match[2] === "~=" ) {
				match[4] = " " + match[4] + " ";
			}

			return match;
		},
		PSEUDO: function(match, curLoop, inplace, result, not){
			if ( match[1] === "not" ) {
				// If we're dealing with a complex expression, or a simple one
				if ( ( chunker.exec(match[3]) || "" ).length > 1 || /^\w/.test(match[3]) ) {
					match[3] = Sizzle(match[3], null, null, curLoop);
				} else {
					var ret = Sizzle.filter(match[3], curLoop, inplace, true ^ not);
					if ( !inplace ) {
						result.push.apply( result, ret );
					}
					return false;
				}
			} else if ( Expr.match.POS.test( match[0] ) || Expr.match.CHILD.test( match[0] ) ) {
				return true;
			}

			return match;
		},
		POS: function(match){
			match.unshift( true );
			return match;
		}
	},
	filters: {
		enabled: function(elem){
			return elem.disabled === false && elem.type !== "hidden";
		},
		disabled: function(elem){
			return elem.disabled === true;
		},
		checked: function(elem){
			return elem.checked === true;
		},
		selected: function(elem){
			// Accessing this property makes selected-by-default
			// options in Safari work properly
			elem.parentNode.selectedIndex;
			return elem.selected === true;
		},
		parent: function(elem){
			return !!elem.firstChild;
		},
		empty: function(elem){
			return !elem.firstChild;
		},
		has: function(elem, i, match){
			return !!Sizzle( match[3], elem ).length;
		},
		header: function(elem){
			return (/h\d/i).test( elem.nodeName );
		},
		text: function(elem){
			return "text" === elem.type;
		},
		radio: function(elem){
			return "radio" === elem.type;
		},
		checkbox: function(elem){
			return "checkbox" === elem.type;
		},
		file: function(elem){
			return "file" === elem.type;
		},
		password: function(elem){
			return "password" === elem.type;
		},
		submit: function(elem){
			return "submit" === elem.type;
		},
		image: function(elem){
			return "image" === elem.type;
		},
		reset: function(elem){
			return "reset" === elem.type;
		},
		button: function(elem){
			return "button" === elem.type || elem.nodeName.toLowerCase() === "button";
		},
		input: function(elem){
			return (/input|select|textarea|button/i).test(elem.nodeName);
		}
	},
	setFilters: {
		first: function(elem, i){
			return i === 0;
		},
		last: function(elem, i, match, array){
			return i === array.length - 1;
		},
		even: function(elem, i){
			return i % 2 === 0;
		},
		odd: function(elem, i){
			return i % 2 === 1;
		},
		lt: function(elem, i, match){
			return i < match[3] - 0;
		},
		gt: function(elem, i, match){
			return i > match[3] - 0;
		},
		nth: function(elem, i, match){
			return match[3] - 0 === i;
		},
		eq: function(elem, i, match){
			return match[3] - 0 === i;
		}
	},
	filter: {
		PSEUDO: function(elem, match, i, array){
			var name = match[1], filter = Expr.filters[ name ];

			if ( filter ) {
				return filter( elem, i, match, array );
			} else if ( name === "contains" ) {
				return (elem.textContent || elem.innerText || getText([ elem ]) || "").indexOf(match[3]) >= 0;
			} else if ( name === "not" ) {
				var not = match[3];

				for ( var j = 0, l = not.length; j < l; j++ ) {
					if ( not[j] === elem ) {
						return false;
					}
				}

				return true;
			} else {
				Sizzle.error( "Syntax error, unrecognized expression: " + name );
			}
		},
		CHILD: function(elem, match){
			var type = match[1], node = elem;
			switch (type) {
				case 'only':
				case 'first':
					while ( (node = node.previousSibling) )	 {
						if ( node.nodeType === 1 ) { 
							return false; 
						}
					}
					if ( type === "first" ) { 
						return true; 
					}
					node = elem;
				case 'last':
					while ( (node = node.nextSibling) )	 {
						if ( node.nodeType === 1 ) { 
							return false; 
						}
					}
					return true;
				case 'nth':
					var first = match[2], last = match[3];

					if ( first === 1 && last === 0 ) {
						return true;
					}

					var doneName = match[0],
						parent = elem.parentNode;

					if ( parent && (parent.sizcache !== doneName || !elem.nodeIndex) ) {
						var count = 0;
						for ( node = parent.firstChild; node; node = node.nextSibling ) {
							if ( node.nodeType === 1 ) {
								node.nodeIndex = ++count;
							}
						} 
						parent.sizcache = doneName;
					}

					var diff = elem.nodeIndex - last;
					if ( first === 0 ) {
						return diff === 0;
					} else {
						return ( diff % first === 0 && diff / first >= 0 );
					}
			}
		},
		ID: function(elem, match){
			return elem.nodeType === 1 && elem.getAttribute("id") === match;
		},
		TAG: function(elem, match){
			return (match === "*" && elem.nodeType === 1) || elem.nodeName.toLowerCase() === match;
		},
		CLASS: function(elem, match){
			return (" " + (elem.className || elem.getAttribute("class")) + " ")
				.indexOf( match ) > -1;
		},
		ATTR: function(elem, match){
			var name = match[1],
				result = Expr.attrHandle[ name ] ?
					Expr.attrHandle[ name ]( elem ) :
					elem[ name ] != null ?
						elem[ name ] :
						elem.getAttribute( name ),
				value = result + "",
				type = match[2],
				check = match[4];

			return result == null ?
				type === "!=" :
				type === "=" ?
				value === check :
				type === "*=" ?
				value.indexOf(check) >= 0 :
				type === "~=" ?
				(" " + value + " ").indexOf(check) >= 0 :
				!check ?
				value && result !== false :
				type === "!=" ?
				value !== check :
				type === "^=" ?
				value.indexOf(check) === 0 :
				type === "$=" ?
				value.substr(value.length - check.length) === check :
				type === "|=" ?
				value === check || value.substr(0, check.length + 1) === check + "-" :
				false;
		},
		POS: function(elem, match, i, array){
			var name = match[2], filter = Expr.setFilters[ name ];

			if ( filter ) {
				return filter( elem, i, match, array );
			}
		}
	}
};

var origPOS = Expr.match.POS,
	fescape = function(all, num){
		return "\\" + (num - 0 + 1);
	};

for ( var type in Expr.match ) {
	Expr.match[ type ] = new RegExp( Expr.match[ type ].source + (/(?![^\[]*\])(?![^\(]*\))/.source) );
	Expr.leftMatch[ type ] = new RegExp( /(^(?:.|\r|\n)*?)/.source + Expr.match[ type ].source.replace(/\\(\d+)/g, fescape) );
}

var makeArray = function(array, results) {
	array = Array.prototype.slice.call( array, 0 );

	if ( results ) {
		results.push.apply( results, array );
		return results;
	}

	return array;
};

// Perform a simple check to determine if the browser is capable of
// converting a NodeList to an array using builtin methods.
// Also verifies that the returned array holds DOM nodes
// (which is not the case in the Blackberry browser)
try {
	Array.prototype.slice.call( document.documentElement.childNodes, 0 )[0].nodeType;

// Provide a fallback method if it does not work
} catch(e){
	makeArray = function(array, results) {
		var ret = results || [], i = 0;

		if ( toString.call(array) === "[object Array]" ) {
			Array.prototype.push.apply( ret, array );
		} else {
			if ( typeof array.length === "number" ) {
				for ( var l = array.length; i < l; i++ ) {
					ret.push( array[i] );
				}
			} else {
				for ( ; array[i]; i++ ) {
					ret.push( array[i] );
				}
			}
		}

		return ret;
	};
}

var sortOrder;

if ( document.documentElement.compareDocumentPosition ) {
	sortOrder = function( a, b ) {
		if ( !a.compareDocumentPosition || !b.compareDocumentPosition ) {
			if ( a == b ) {
				hasDuplicate = true;
			}
			return a.compareDocumentPosition ? -1 : 1;
		}

		var ret = a.compareDocumentPosition(b) & 4 ? -1 : a === b ? 0 : 1;
		if ( ret === 0 ) {
			hasDuplicate = true;
		}
		return ret;
	};
} else if ( "sourceIndex" in document.documentElement ) {
	sortOrder = function( a, b ) {
		if ( !a.sourceIndex || !b.sourceIndex ) {
			if ( a == b ) {
				hasDuplicate = true;
			}
			return a.sourceIndex ? -1 : 1;
		}

		var ret = a.sourceIndex - b.sourceIndex;
		if ( ret === 0 ) {
			hasDuplicate = true;
		}
		return ret;
	};
} else if ( document.createRange ) {
	sortOrder = function( a, b ) {
		if ( !a.ownerDocument || !b.ownerDocument ) {
			if ( a == b ) {
				hasDuplicate = true;
			}
			return a.ownerDocument ? -1 : 1;
		}

		var aRange = a.ownerDocument.createRange(), bRange = b.ownerDocument.createRange();
		aRange.setStart(a, 0);
		aRange.setEnd(a, 0);
		bRange.setStart(b, 0);
		bRange.setEnd(b, 0);
		var ret = aRange.compareBoundaryPoints(Range.START_TO_END, bRange);
		if ( ret === 0 ) {
			hasDuplicate = true;
		}
		return ret;
	};
}

// Utility function for retreiving the text value of an array of DOM nodes
function getText( elems ) {
	var ret = "", elem;

	for ( var i = 0; elems[i]; i++ ) {
		elem = elems[i];

		// Get the text from text nodes and CDATA nodes
		if ( elem.nodeType === 3 || elem.nodeType === 4 ) {
			ret += elem.nodeValue;

		// Traverse everything else, except comment nodes
		} else if ( elem.nodeType !== 8 ) {
			ret += getText( elem.childNodes );
		}
	}

	return ret;
}

// Check to see if the browser returns elements by name when
// querying by getElementById (and provide a workaround)
(function(){
	// We're going to inject a fake input element with a specified name
	var form = document.createElement("div"),
		id = "script" + (new Date()).getTime();
	form.innerHTML = "<a name='" + id + "'/>";

	// Inject it into the root element, check its status, and remove it quickly
	var root = document.documentElement;
	root.insertBefore( form, root.firstChild );

	// The workaround has to do additional checks after a getElementById
	// Which slows things down for other browsers (hence the branching)
	if ( document.getElementById( id ) ) {
		Expr.find.ID = function(match, context, isXML){
			if ( typeof context.getElementById !== "undefined" && !isXML ) {
				var m = context.getElementById(match[1]);
				return m ? m.id === match[1] || typeof m.getAttributeNode !== "undefined" && m.getAttributeNode("id").nodeValue === match[1] ? [m] : undefined : [];
			}
		};

		Expr.filter.ID = function(elem, match){
			var node = typeof elem.getAttributeNode !== "undefined" && elem.getAttributeNode("id");
			return elem.nodeType === 1 && node && node.nodeValue === match;
		};
	}

	root.removeChild( form );
	root = form = null; // release memory in IE
})();

(function(){
	// Check to see if the browser returns only elements
	// when doing getElementsByTagName("*")

	// Create a fake element
	var div = document.createElement("div");
	div.appendChild( document.createComment("") );

	// Make sure no comments are found
	if ( div.getElementsByTagName("*").length > 0 ) {
		Expr.find.TAG = function(match, context){
			var results = context.getElementsByTagName(match[1]);

			// Filter out possible comments
			if ( match[1] === "*" ) {
				var tmp = [];

				for ( var i = 0; results[i]; i++ ) {
					if ( results[i].nodeType === 1 ) {
						tmp.push( results[i] );
					}
				}

				results = tmp;
			}

			return results;
		};
	}

	// Check to see if an attribute returns normalized href attributes
	div.innerHTML = "<a href='#'></a>";
	if ( div.firstChild && typeof div.firstChild.getAttribute !== "undefined" &&
			div.firstChild.getAttribute("href") !== "#" ) {
		Expr.attrHandle.href = function(elem){
			return elem.getAttribute("href", 2);
		};
	}

	div = null; // release memory in IE
})();

if ( document.querySelectorAll ) {
	(function(){
		var oldSizzle = Sizzle, div = document.createElement("div");
		div.innerHTML = "<p class='TEST'></p>";

		// Safari can't handle uppercase or unicode characters when
		// in quirks mode.
		if ( div.querySelectorAll && div.querySelectorAll(".TEST").length === 0 ) {
			return;
		}

		Sizzle = function(query, context, extra, seed){
			context = context || document;

			// Only use querySelectorAll on non-XML documents
			// (ID selectors don't work in non-HTML documents)
			if ( !seed && context.nodeType === 9 && !isXML(context) ) {
				try {
					return makeArray( context.querySelectorAll(query), extra );
				} catch(e){}
			}

			return oldSizzle(query, context, extra, seed);
		};

		for ( var prop in oldSizzle ) {
			Sizzle[ prop ] = oldSizzle[ prop ];
		}

		div = null; // release memory in IE
	})();
}

(function(){
	var div = document.createElement("div");

	div.innerHTML = "<div class='test e'></div><div class='test'></div>";

	// Opera can't find a second classname (in 9.6)
	// Also, make sure that getElementsByClassName actually exists
	if ( !div.getElementsByClassName || div.getElementsByClassName("e").length === 0 ) {
		return;
	}

	// Safari caches class attributes, doesn't catch changes (in 3.2)
	div.lastChild.className = "e";

	if ( div.getElementsByClassName("e").length === 1 ) {
		return;
	}

	Expr.order.splice(1, 0, "CLASS");
	Expr.find.CLASS = function(match, context, isXML) {
		if ( typeof context.getElementsByClassName !== "undefined" && !isXML ) {
			return context.getElementsByClassName(match[1]);
		}
	};

	div = null; // release memory in IE
})();

function dirNodeCheck( dir, cur, doneName, checkSet, nodeCheck, isXML ) {
	for ( var i = 0, l = checkSet.length; i < l; i++ ) {
		var elem = checkSet[i];
		if ( elem ) {
			elem = elem[dir];
			var match = false;

			while ( elem ) {
				if ( elem.sizcache === doneName ) {
					match = checkSet[elem.sizset];
					break;
				}

				if ( elem.nodeType === 1 && !isXML ){
					elem.sizcache = doneName;
					elem.sizset = i;
				}

				if ( elem.nodeName.toLowerCase() === cur ) {
					match = elem;
					break;
				}

				elem = elem[dir];
			}

			checkSet[i] = match;
		}
	}
}

function dirCheck( dir, cur, doneName, checkSet, nodeCheck, isXML ) {
	for ( var i = 0, l = checkSet.length; i < l; i++ ) {
		var elem = checkSet[i];
		if ( elem ) {
			elem = elem[dir];
			var match = false;

			while ( elem ) {
				if ( elem.sizcache === doneName ) {
					match = checkSet[elem.sizset];
					break;
				}

				if ( elem.nodeType === 1 ) {
					if ( !isXML ) {
						elem.sizcache = doneName;
						elem.sizset = i;
					}
					if ( typeof cur !== "string" ) {
						if ( elem === cur ) {
							match = true;
							break;
						}

					} else if ( Sizzle.filter( cur, [elem] ).length > 0 ) {
						match = elem;
						break;
					}
				}

				elem = elem[dir];
			}

			checkSet[i] = match;
		}
	}
}

var contains = document.compareDocumentPosition ? function(a, b){
	return !!(a.compareDocumentPosition(b) & 16);
} : function(a, b){
	return a !== b && (a.contains ? a.contains(b) : true);
};

var isXML = function(elem){
	// documentElement is verified for cases where it doesn't yet exist
	// (such as loading iframes in IE - #4833) 
	var documentElement = (elem ? elem.ownerDocument || elem : 0).documentElement;
	return documentElement ? documentElement.nodeName !== "HTML" : false;
};

var posProcess = function(selector, context){
	var tmpSet = [], later = "", match,
		root = context.nodeType ? [context] : context;

	// Position selectors must be done after the filter
	// And so must :not(positional) so we move all PSEUDOs to the end
	while ( (match = Expr.match.PSEUDO.exec( selector )) ) {
		later += match[0];
		selector = selector.replace( Expr.match.PSEUDO, "" );
	}

	selector = Expr.relative[selector] ? selector + "*" : selector;

	for ( var i = 0, l = root.length; i < l; i++ ) {
		Sizzle( selector, root[i], tmpSet );
	}

	return Sizzle.filter( later, tmpSet );
};

// EXPOSE

window.Sizzle = Sizzle;

})();},
    "lib/browser/vml_context.js": function() {/* 
 * vml_context.js
 * vienna
 * 
 * Created by Adam Beynon.
 * Copyright 2010 Adam Beynon.
 *
 * Permission is hereby granted, free of charge, to any person obtaining a copy
 * of this software and associated documentation files (the "Software"), to deal
 * in the Software without restriction, including without limitation the rights
 * to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
 * copies of the Software, and to permit persons to whom the Software is
 * furnished to do so, subject to the following conditions:
 * 
 * The above copyright notice and this permission notice shall be included in
 * all copies or substantial portions of the Software.
 * 
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
 * FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
 * AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
 * LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
 * OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
 * THE SOFTWARE.
 */


if (!document.createElement('canvas').getContext) {
  document.namespaces.add("v", "urn:schemas-microsoft-com:vml", "#default#VML");
  var css = document.createStyleSheet();
  css.cssText = 'canvas { overflow:hidden; display:inline-block; width: 300px; height: 150px }';
  
}
}
  }
});
opal.require('browser');
