import { NgModule, ModuleWithProviders } from '@angular/core';

import { CookieModule } from 'ngx-cookie';

import { NgLimpComponent } from './ng-limp.component';
import { ApiService, CacheService } from './ng-limp.service';

@NgModule({
	declarations: [ NgLimpComponent ],
	imports: [ CookieModule.forRoot() ],
	exports: [ NgLimpComponent ]
})
export class NgLimpModule {
	public static forRoot(): ModuleWithProviders {
		return {
			ngModule: NgLimpModule,
			providers: [
				CacheService,
				ApiService
			]
		};
	}
}
