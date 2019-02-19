import { Observable, Subject } from 'rxjs';
import { webSocket } from 'rxjs/webSocket';

import { CookieService } from 'ngx-cookie';
import * as rs from 'jsrsasign';
import { Inject, Injectable } from '@angular/core';

const JWS = rs.jws.JWS;

export interface callArgs {
	call_id?: string;
	endpoint?: string;
	sid?: string;
	token?: string;
	query?: any;
	doc?: any;
}

export interface Res<T> {
	args: {
		call_id: string;
		// [DOC] Succeful call attrs
		docs?: Array<T>;
		count?: number;
		total?: number;
		groups?: any;
		// [DOC] Failed call attrs
		code?: string;
	}
	msg: string;
	status: number;
}

export interface Doc {
	_id: string;
	[key: string]: any;
}

@Injectable()
export class CacheService {

	constructor(private cookie: CookieService) { }

	get(key: string): string {
		return this.cookie.get(key);
	}

	put(key: string, val: string): void {
		this.cookie.put(key, val);
	}

	remove(key: string): void {
		this.cookie.remove(key);
	}
}

@Injectable()
export class ApiService {
	subject!: Subject<any>;
	ws_api!: string;
	http_api!: string;
	anon_token!: string;

	session!: any;

	authed: boolean = false;
	authed$: Subject<boolean> = new Subject();

	constructor(private cache: CacheService) { }

	init(ws_api: string, http_api: string, anon_token: string): Observable<any> {
		this.ws_api = ws_api;
		this.http_api = http_api;
		this.anon_token = anon_token;
		this.subject = webSocket(this.ws_api);
		let init = new Observable(
			(observer) => {
				this.subject.subscribe(
					(msg: Res<Doc>) => {
						observer.next(msg);
					},
					(err: Res<Doc>) => {
						observer.error(err);

						this.cache.remove('token');
						this.cache.remove('sid');

						this.authed = false;
						this.session = undefined;
						this.authed$.next(this.session);
					},
					() => {
						this.reconnect();
					}
				);
			}
		);
		return init;
	}

	reconnect(): void {
	}

	call(endpoint: string, callArgs: callArgs, binary: boolean = false): Observable<any> {
		callArgs.sid = (this.authed) ? callArgs.sid || this.cache.get('sid') || 'f00000000000000000000012' : 'f00000000000000000000012';
		callArgs.token = (this.authed) ? callArgs.token || this.cache.get('token') || this.anon_token : this.anon_token;
		callArgs.query = callArgs.query || {};
		callArgs.doc = callArgs.doc || {};

		callArgs.endpoint = endpoint;
		callArgs.call_id = Math.random().toString(36).substring(7);

		// console.log('callArgs', callArgs);
		// console.log('sJWT', sJWT);

		let filesProcess = [];

		for (let attr of Object.keys(callArgs.doc)) {
			if (callArgs.doc[attr] instanceof FileList) {
				let files = callArgs.doc[attr];
				callArgs.doc[attr] = [];
				for (let file of files) {
					callArgs.doc[attr].push(file);
				}
				for (let i of Object.keys(callArgs.doc[attr])) {
					filesProcess.push(`${attr}.i`);
					let reader = new FileReader();
					reader.onloadend = (file) => {
						let byteArray = new Uint8Array((reader.result as any));
						callArgs.doc[attr][i] = {
							name: callArgs.doc[attr][i].name,
							size: callArgs.doc[attr][i].size,
							type: callArgs.doc[attr][i].type,
							lastModified: callArgs.doc[attr][i].lastModified,
							content: byteArray.join(',')
						};
						filesProcess.splice(filesProcess.indexOf(`${attr}.i`), 1);
					};
					reader.readAsArrayBuffer(callArgs.doc[attr][i]);
				}
			}
		}
		this.pushCall(callArgs, filesProcess);

		let call = new Observable(
			(observer) => {
				this.subject
					.subscribe(
						(res: Res<Doc>) => {
							// console.log('message received', res);
							if (res.status == 291) {
								// [TODO] Create files handling sequence.
								return;
							}
							if (res.args && res.args.call_id == callArgs.call_id) {
								if (res.status == 200) {
									observer.next(res);
								} else {
									observer.error(res);
								}
							}
						}, (err: Res<Doc>) => {
							if (err.args && err.args.call_id == callArgs.call_id) {
								observer.error(err);
							}
							// if (err._body.args.code == 'CORE_SESSION_INVALID_SESSION') {
							// 	this.cache.remove('token');
							// 	this.cache.remove('sid');
							// }
						}, () => {
							observer.complete();
						}
					);
			}
		);
		return call;
	}

	pushCall(callArgs: any, filesProcess: Array<string>): void {
		setTimeout(() => {
			// console.log('checking filesProcess...');
			if (filesProcess.length) {
				this.pushCall(callArgs, filesProcess);
			} else {
				// if (callArgs.token == this.anon_token) {
				// 	this.subject.next(callArgs);
				// } else {
				// Header
				let oHeader = { alg: 'HS256', typ: 'JWT' };
				// Payload
				let tNow = Math.round((new Date() as any) / 1000);
				let tEnd = Math.round((new Date() as any) / 1000) + 86400;
				let sHeader = JSON.stringify(oHeader);
				let sPayload = JSON.stringify({ ...callArgs, iat: tNow, exp: tEnd });
				// console.log(sHeader, sPayload, callArgs.token);
				let sJWT = JWS.sign('HS256', sHeader, sPayload, { utf8: callArgs.token });
				console.log('sending request as JWT token:', callArgs, callArgs.token);
				this.subject.next({ token: sJWT });
				// }
			}
		}, 100);
	}

	generateAuthHash(authVar: 'username' | 'email' | 'phone', authVal: string, password: string): string {
		let oHeader = { alg: 'HS256', typ: 'JWT' };
		let sHeader = JSON.stringify(oHeader);
		let sPayload = JSON.stringify({ hash: [authVar, authVal, password] });
		let sJWT = JWS.sign('HS256', sHeader, sPayload, { utf8: password });
		return sJWT.split('.')[1];
	}

	auth(authVar: 'username' | 'email' | 'phone', authVal: string, password: string): Observable<any> {
		let doc: any = { hash: this.generateAuthHash(authVar, authVal, password) };
		doc[authVar] = authVal;
		let call = new Observable(
			(observer) => {
				this.authed = false;
				this.session = undefined;
				this.authed$.next(this.session);

				this.cache.remove('token');
				this.cache.remove('sid');
				this.call('session/auth', {
					doc: doc
				}).subscribe((res) => {
					this.cache.put('sid', res.args.docs[0]._id);
					this.cache.put('token', res.args.docs[0].token);

					this.authed = true;
					this.session = res.args.docs[0];
					this.authed$.next(this.session);

					observer.next(res);
				}, (err) => {
					observer.error(err);
				}, () => {
					observer.complete();
				});
			}
		);
		return call;
	}

	reauth(sid: string = this.cache.get('sid'), token: string = this.cache.get('token')): Observable<any> {
		let oHeader = { alg: 'HS256', typ: 'JWT' };
		let sHeader = JSON.stringify(oHeader);
		let sPayload = JSON.stringify({ token: token });
		let sJWT = JWS.sign('HS256', sHeader, sPayload, { utf8: token });
		return this.call('session/reauth', {
			sid: 'f00000000000000000000012',
			token: this.anon_token,
			query: { _id: { val: sid || 'f00000000000000000000012' }, hash: { val: sJWT.split('.')[1] } }
		});
	}

	signout(): Observable<any> {
		let call = new Observable(
			(observer) => {
				this.call('session/signout', {
					query: { _id: { val: this.cache.get('sid') } }
				}).subscribe((res) => {
					this.authed = false;
					this.session = undefined;
					this.authed$.next(this.session);

					this.cache.remove('token');
					this.cache.remove('sid');

					observer.next(true);
				}, (err) => {
					observer.error(err);
				});

			}
		);
		return call;
	}

	checkAuth(): Observable<any> {
		// console.log('attempting checkAuth');
		let check = new Observable(
			(observer) => {
				if (!this.cache.get('token') || !this.cache.get('sid')) observer.error(new Error('No credentials cached.'));
				this.reauth(this.cache.get('sid'), this.cache.get('token')).subscribe(
					(res) => {
						this.authed = true;
						this.session = res.args.docs[0];
						this.authed$.next(this.session);

						observer.next(res);
					},
					(err) => {
						this.cache.remove('token');
						this.cache.remove('sid');

						this.authed = false;
						this.session = undefined;
						this.authed$.next(this.session);

						observer.error({
							status: 403,
							message: 'Wrong credentials cached.'
						})
					},
					() => observer.complete()
				);
			}
		);
		return check;
	}
}
