import { Component, OnInit } from '@angular/core';
import { take, retry } from 'rxjs/operators';
import { ApiService } from 'ng-limp'
import { Res, Doc } from 'ng-limp';

@Component({
	selector: 'app-root',
	templateUrl: './app.component.html',
	styleUrls: ['./app.component.css']
})
export class AppComponent implements OnInit {
	title = 'ng-limp-test';

	constructor(private api: ApiService) { }

	ngOnInit() {
		this.api.debug = true;
		this.api.init('ws://localhost:8081/ws', '__ANON')
			.pipe(retry(10))
			.subscribe((res: Res<Doc>) => {
				if (res.args.code == 'CORE_CONN_OK') {
					// this.api.checkAuth().subscribe((res) => {
						this.api.call('some/call', { sid: 'bull_crap', token: 'wrong_token' }).subscribe();
					// });
				}
				console.log('res', res);
			}, (err) => {
				// if (err.type == 'close' && this.api.authed) {
				// 	this.api.checkAuth();
				// } else {
				// 	this.api.call('connection/refresh', {}).pipe(take(1)).subscribe();
				// }
			});
		this.api.authed$.subscribe((res) => {
			window.location.assign('some-url');
		}, (err) => {

		})
	}

	submit(): void {
		this.api.call('staff/create', {
			doc: {
				name: {
					ar_AE: 'staff ar',
					en_AE: 'staff en'
				},
				bio: {
					ar_AE: 'bio ar',
					en_AE: 'bio en'
				},
				jobtitle: {
					ar_AE: 'jobtitle ar',
					en_AE: 'jobtitle en'
				},
				photo: document.querySelector('input').files,
			}
		}).subscribe((res) => { console.log(res); });
	}

	createblogcat(): void {
		this.api.call('blog_cat/create', {
			doc: {
				title: {
					ar_AE: 'staff ar',
					en_AE: 'staff en'
				},
				desc: {
					ar_AE: 'staff ar',
					en_AE: 'staff en'
				}
			}
		}).subscribe((res) => { console.log(res); });
	}
}
