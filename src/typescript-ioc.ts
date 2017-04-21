"use strict";
/**
 * This is a lightweight annotation-based dependency injection container for typescript.
 *
 * Visit the project page on [GitHub] (https://github.com/thiagobustamante/typescript-ioc).
 */

import "reflect-metadata"

/**
 * A decorator to tell the container that this class should be handled by the Singleton [[Scope]].
 *
 * ```
 * @ Singleton
 * class PersonDAO {
 *
 * }
 * ```
 *
 * Is the same that use:
 *
 * ```
 * Container.bind(PersonDAO).scope(Scope.Singleton)
 * ```
 */
export function Singleton(target: Function) {
    IoCContainer.bind(target).scope(Scope.Singleton);
}

/**
 * A decorator to tell the container that this class should be handled by the provided [[Scope]].
 * For example:
 *
 * ```
 * class MyScope extends Scope {
 *   resolve(iocProvider:Provider, source:Function) {
 *     console.log('created by my custom scope.')
 *     return iocProvider.get();
 *   }
 * }
 * @ Scoped(new MyScope())
 * class PersonDAO {
 * }
 * ```
 *
 * Is the same that use:
 *
 * ```
 * Container.bind(PersonDAO).scope(new MyScope());
 * ```
 * @param scope The scope that will handle instantiations for this class.
 */
export function Scoped(scope: Scope) {
    return function(target: Function) {
        IoCContainer.bind(target).scope(scope);
    }
}

/**
 * A decorator to tell the container that this class should instantiated by the given [[Provider]].
 * For example:
 *
 * ```
 * @ Provided({get: () => { return new PersonDAO(); }})
 * class PersonDAO {
 * }
 * ```
 *
 * Is the same that use:
 *
 * ```
 * Container.bind(PersonDAO).provider({get: () => { return new PersonDAO(); }});
 * ```
 * @param provider The provider that will handle instantiations for this class.
 */
export function Provided(provider: Provider) {
    return function(target: Function) {
        IoCContainer.bind(target).provider(provider);
    }
}

/**
 * A decorator to tell the container that this class should be used as the implementation for a given base class.
 * For example:
 *
 * ```
 * class PersonDAO {
 * }
 *
 * @ Provides(PersonDAO)
 * class ProgrammerDAO extends PersonDAO{
 * }
 * ```
 *
 * Is the same that use:
 *
 * ```
 * Container.bind(PersonDAO).to(ProgrammerDAO);
 * ```
 * @param target The base class that will be replaced by this class.
 */
export function Provides(target: Function) {
    return function(to: Function) {
        IoCContainer.bind(target).to(to);
    }
}

let construct;
/**
 * A decorator to tell the container that this class should its instantiation always handled by the Container.
 *
 * An AutoWired class will have its constructor overriden to always delegate its instantiation to the IoC Container.
 * So, if you write:
 *
 * ```
 * @ AutoWired
 * class PersonService {
 *   @ Inject
 *   personDAO: PersonDAO;
 * }
 * ```
 *
 * Any PersonService instance will be created by the IoC Container, even when a direct call to its constructor is called:
 *
 * ```
 * let PersonService = new PersonService(); // will be returned by Container, and all internal dependencies resolved.
 * ```
 *
 * It is the same that use:
 *
 * ```
 * Container.bind(PersonService);
 * let personService: PersonService = Container.get(PersonService);
 * ```
 */
export function AutoWired(target: Function) {//<T extends {new(...args:any[]):{}}>(target:T) {
    let newConstructor = InjectorHanlder.decorateConstructor(target);
    let config: ConfigImpl = <ConfigImpl>IoCContainer.bind(target)
    config.toConstructor(newConstructor);
    return newConstructor;
}

/**
 * A decorator to request from Container that it resolve the annotated property dependency.
 * For example:
 *
 * ```
 * @ AutoWired
 * class PersonService {
 *    constructor (@ Inject creationTime: Date) {
 *       this.creationTime = creationTime;
 *    }    
 *    @ Inject
 *    personDAO: PersonDAO;
 *
 *    creationTime: Date;
 * }
 *
 * ```
 *
 * When you call:
 *
 * ```
 * let personService: PersonService = Container.get(PersonService);
 * // The properties are all defined, retrieved from the IoC Container
 * console.log('PersonService.creationTime: ' + personService.creationTime); 
 * console.log('PersonService.personDAO: ' + personService.personDAO); 
 * ```
 */
export function Inject(...args: any[]) {
    if (args.length < 3 || typeof args[2] === "undefined") {
        return InjectPropertyDecorator.apply(this, args);
    }
    else if (args.length == 3 && typeof args[2] === "number") {
        return InjectParamDecorator.apply(this, args);
    }

    throw new Error("Invalid @Inject Decorator declaration.");
}

/**
 * Decorator processor for [[Inject]] decorator on properties
 */
function InjectPropertyDecorator(target: Function, key: string) {
    let t = Reflect.getMetadata("design:type", target, key);
    IoCContainer.injectProperty(target.constructor, key, t);
}

/**
 * Decorator processor for [[Inject]] decorator on constructor parameters
 */
function InjectParamDecorator(target: Function, propertyKey: string | symbol, parameterIndex: number) {
    if (!propertyKey) { // only intercept constructor parameters 
        let config: ConfigImpl = <ConfigImpl>IoCContainer.bind(target)
        config.paramTypes = config.paramTypes || [];
        const paramTypes: Array<any> = Reflect.getMetadata("design:paramtypes", target);
        config.paramTypes.unshift(paramTypes[parameterIndex]);
    }
}

/**
 * The IoC Container class. Can be used to register and to retrieve your dependencies.
 * You can also use de decorators [[AutoWired]], [[Scoped]], [[Singleton]], [[Provided]] and [[Provides]]
 * to configure the dependency directly on the class.
 */
export class Container {
    /**
     * Add a dependency to the Container. If this type is already present, just return its associated 
     * configuration object.
     * Example of usage:
     *
     * ```
     * Container.bind(PersonDAO).to(ProgrammerDAO).scope(Scope.Singleton);
     * ```
     * @param source The type that will be bound to the Container
     * @return a container configuration
     */
    static bind(source: Function): Config {
        if (!IoCContainer.isBound(source))
        {
            AutoWired(source);
            return IoCContainer.bind(source).to(source);
        }

        return IoCContainer.bind(source);
    }

    /**
     * Retrieve an object from the container. It will resolve all dependencies and apply any type replacement
     * before return the object.
     * If there is no declared dependency to the given source type, an implicity bind is performed to this type.
     * @param source The dependency type to resolve
     * @return an object resolved for the given source type;
     */
    static get(source: Function) {
        return IoCContainer.get(source);
    }
}

/**
 * Internal implementation of IoC Container.
 */
class IoCContainer {
    private static bindings: Map<FunctionConstructor,ConfigImpl> = new Map<FunctionConstructor,ConfigImpl>();

    static isBound(source: Function): boolean
    {
        checkType(source);
        const baseSource = InjectorHanlder.getConstructorFromType(source);
        let config: ConfigImpl = IoCContainer.bindings.get(baseSource);
        return (!!config);
    }

    static bind(source: Function): Config {
        checkType(source);
        const baseSource = InjectorHanlder.getConstructorFromType(source);
        let config: ConfigImpl = IoCContainer.bindings.get(baseSource);
        if (!config) {
            config = new ConfigImpl(baseSource);
            IoCContainer.bindings.set(baseSource, config);
        }
        return config;
    }

    static get(source: Function) {
        let config: ConfigImpl = <ConfigImpl>IoCContainer.bind(source);
        if (!config.iocprovider) {
            config.to(<FunctionConstructor>config.source);
        }
        return config.getInstance();
    }

    static injectProperty(target: Function, key: string, propertyType: Function) {
        const propKey = `__${key}`;
        Object.defineProperty(target.prototype, key, {
            enumerable: true,
            get: function(){
                return this[propKey]?this[propKey]:this[propKey]=IoCContainer.get(propertyType);
            },
            set: (newValue) => {
                this[propKey] = newValue;
            } 
        });
    }

    static assertInstantiable(target: Function) {
        if (target['__block_Instantiation']) {
            throw new TypeError("Can not instantiate Singleton class. " +
                "Ask Container for it, using Container.get");
        }
    }
}

/**
 * Utility function to validate type
 */
function checkType(source: Object) {
    if (!source) {
        throw new TypeError('Invalid type requested to IoC ' +
            'container. Type is not defined.');
    }
}

/**
 * A bind configuration for a given type in the IoC Container.
 */
export interface Config {
    /**
     * Inform a given implementation type to be used when a dependency for the source type is requested.
     * @param target The implementation type
     */
    to(target: Object): Config;
    /**
     * Inform a provider to be used to create instances when a dependency for the source type is requested.
     * @param provider The provider to create instances
     */
    provider(provider: Provider): Config;
    /**
     * Inform a scope to handle the instances for objects created by the Container for this binding.
     * @param scope Scope to handle instances
     */
    scope(scope: Scope): Config;

    /**
     * Inform the types to be retrieved from IoC Container and passed to the type constructor.
     * @param paramTypes A list with parameter types.
     */
    withParams(...paramTypes): Config;
}

class ConfigImpl implements Config {
    source: Function;
    iocprovider: Provider;
    iocscope: Scope;
    decoratedConstructor: FunctionConstructor;
    paramTypes: Array<any>;

    constructor(source: Function) {
        this.source = source;
    }

    to(target: FunctionConstructor) {
        checkType(target);
        const targetSource = InjectorHanlder.getConstructorFromType(target);
        if (this.source === targetSource) {
            const _this = this;
            this.iocprovider = {
                get: () => {
                    const params = _this.getParameters();
                    if (_this.decoratedConstructor) {
                        return (params?new _this.decoratedConstructor(...params):new _this.decoratedConstructor());
                    }
                    return (params?new target(...params):new target());
                }
            };
        }
        else {
            this.iocprovider = {
                get: () => {
                    return IoCContainer.get(target);
                }
            };
        }
        if (this.iocscope) {
            this.iocscope.reset(this.source);
        }
        return this;
    }

    provider(provider: Provider) {
        this.iocprovider = provider;
        if (this.iocscope) {
            this.iocscope.reset(this.source);
        }
        return this;
    }

    scope(scope: Scope) {
        this.iocscope = scope;
        if (scope === Scope.Singleton) {
            this.source['__block_Instantiation'] = true;
            scope.reset(this.source);
        }
        else if (this.source['__block_Instantiation']) {
            delete this.source['__block_Instantiation'];
        }
        return this;
    }

    withParams(...paramTypes) {
        this.paramTypes = paramTypes;
        return this;
    }

    toConstructor(newConstructor: FunctionConstructor) {
        this.decoratedConstructor = newConstructor;
        return this;
    }

    getInstance() {
        if (!this.iocscope) {
            this.scope(Scope.Local);
        }
        return this.iocscope.resolve(this.iocprovider, this.source);
    }

    private getParameters() {
        if (this.paramTypes) {
            return this.paramTypes.map(paramType => IoCContainer.get(paramType));
        }
        return null;
    }
}

/**
 * A factory for instances created by the Container. Called every time an instance is needed.
 */
export interface Provider {
    /** 
     * Factory method, that should create the bind instance.
     * @return the instance to be used by the Container
     */
    get(): Object;
}

/**
 * Class responsible to handle the scope of the instances created by the Container
 */
export abstract class Scope {
    /**
     * A reference to the LocalScope. Local Scope return a new instance for each dependency resolution requested.
     * This is the default scope.
     */
    static Local: Scope;
    /**
     * A reference to the SingletonScope. Singleton Scope return the same instance for any 
     * dependency resolution requested.
     */
    static Singleton: Scope;

    /**
     * Method called when the Container needs to resolve a dependency. It should return the instance that will
     * be returned by the Container.
     * @param provider The provider associated with the current bind. Used to create new instances when necessary.
     * @param source The source type of this bind.
     * @return the resolved instance.
     */
    abstract resolve(provider: Provider, source: Function): any;

    /**
     * Called by the IoC Container when some configuration is changed on the Container binding.
     * @param source The source type that has its configuration changed.
     */
    reset(source: Function) {

    }
}

/**
 * Default [[Scope]] that always create a new instace for any dependency resolution request
 */
class LocalScope extends Scope {
    resolve(provider: Provider, source: Function) {
        return provider.get();
    }
}

Scope.Local = new LocalScope();

/**
 * Scope that create only a single instace to handle all dependency resolution requests.
 */
class SingletonScope extends Scope {
    private static instances: Map<Function,any> = new Map<Function,any>();

    resolve(provider: Provider, source: Function) {
        let instance: any = SingletonScope.instances.get(source);
        if (!instance) {
            source['__block_Instantiation'] = false;
            instance = provider.get();
            source['__block_Instantiation'] = true;
            SingletonScope.instances.set(source, instance);
        }
        return instance;
    }

    reset(source: Function) {
        SingletonScope.instances.delete(InjectorHanlder.getConstructorFromType(source));
    }
}

Scope.Singleton = new SingletonScope();


/**
 * Utility class to handle injection behavior on class decorations.
 */
class InjectorHanlder {
    static decorateConstructor(target: Function) {
        let newConstructor;
        newConstructor = class ioc_wrapper extends (<FunctionConstructor>target) {        
            constructor (...args) {
                super(...args);
                IoCContainer.assertInstantiable(target);
            }
        }
        newConstructor['__parent'] = target;
        return newConstructor;
    }

    static getConstructorFromType(target: Function): FunctionConstructor {
        let typeConstructor: Function = target;
        if (typeConstructor['name'] && typeConstructor['name'] !== 'ioc_wrapper') {
            return <FunctionConstructor>typeConstructor;
        }
        while (typeConstructor = typeConstructor['__parent']) {
            if (typeConstructor['name'] && typeConstructor['name'] !== 'ioc_wrapper') {
                return <FunctionConstructor>typeConstructor;
            }
        }
        throw TypeError('Can not identify the base Type for requested target');
    }
}

// For compatibility with ES5
interface Map<K, V> {
    clear(): void;
    delete(key: K): boolean;
    forEach(callbackfn: (value: V, key: K, map: Map<K, V>) => void, thisArg?: any): void;
    get(key: K): V | undefined;
    has(key: K): boolean;
    set(key: K, value?: V): this;
    readonly size: number;
}

interface MapConstructor {
    new (): Map<any, any>;
    new <K, V>(entries?: [K, V][]): Map<K, V>;
    readonly prototype: Map<any, any>;
}
declare var Map: MapConstructor;
