---
---
var IncomeCalculator = function() {
  var self = this;

  this.VAT = {{ site.vat }};

  function TaxBand(marginalRate, baseAmount, threshold, limit) {
    this.marginalRate = marginalRate;
    this.baseAmount = baseAmount;
    this.threshold = threshold;
    this.limit = (arguments.length > 3) ? this.limit = limit : this.limit = Number.POSITIVE_INFINITY;
  }

  // TODO: Move to _data
  // tax bands -- with thanks to http://www.oldmutual.co.za/markets/south-african-budget/income-tax-calculator
  this.TAX_TABLE = [
    new TaxBand(0.18, 0, 0, 189880/12),
    new TaxBand(0.26, 34178/12, 189881/12, 296540/12),
    new TaxBand(0.31, 61910/12, 296541/12, 410460/12),
    new TaxBand(0.36, 97225/12, 410461/12, 555600/12),
    new TaxBand(0.39, 149475/12, 555601/12, 708310/12),
    new TaxBand(0.41, 209032/12, 708311/12, 1500000/12),
    new TaxBand(0.45, 533625/12, 1500001/12)
  ];

  this.PRIMARY_REBATE = {{ site.primary_rebate }};

  // Budget revenue streams from individuals (billions)
  // http://www.treasury.gov.za/documents/national%20budget/2017/review/FullBR.pdf (page 4)
  this.PERSONAL_INCOME_TAX_REVENUE = {{ site.income_tax_revenue }};
  this.VAT_REVENUE = {{ site.vat_revenue }};

  // Budget expenditure by category, in millions
  // see https://docs.google.com/spreadsheets/d/18pS6-GXmV2AE6TqKtYYzL6Ag-ZuwiE4jb53U9heWF1M/edit#gid=0

  // TODO: Move to _data
  // Categorised expenditure (should, but doesn't have to, total to CONSOLIDATED_EXPENDITURE)
  this.EXPENDITURE = {
    'Basic education': 232600,
    'Higher education & training': 77500,
    'Health': 187500,
    'Social grants': 180000,
    'Employment & labour affairs': 75900,
    'Trade & industry': 28900,
    'Economic infrastructure': 89500,
    'Defence & state security': 54000,
    'Law courts & prisons': 43800,
    'Police services': 93800,
    'Home affairs': 7200,
    'Local government and housing': 195800,
    'Agriculture, rural development & land reform': 26500,
    'Science & Technology and environment': 20600,
    'Arts, sports, recreation and culture': 10400,
    'General public services': 70700,
    'National debt': 162400,
    'Unallocated reserves': 6000,
  };

  // override ordering
  this.ORDERING = {
    'Working for yourself': 9999,
    'National debt': -1,
  };

  // Total budget expenditure
  this.CONSOLIDATED_EXPENDITURE = _.reduce(_.values(this.EXPENDITURE), function(t, n) { return t + n; }, 0);

  // fraction of budget line items that are funded through
  // personal tax and VAT
  this.TAXPAYER_RATIO = (this.PERSONAL_INCOME_TAX_REVENUE + this.VAT_REVENUE) / this.CONSOLIDATED_EXPENDITURE;

  // start of day as a moment.js object. The date is irrelevant.
  this.START_OF_DAY = moment().hour(8).minute(0).second(0);

  this.WORKDAY_HOURS = 8;
  this.WORKDAY_MINS = this.WORKDAY_HOURS * 60;
  //let's make sure the day ends at 5pm by adding 60 minutes to the 480 WORKDAY_MINS.
  this.END_OF_DAY = this.START_OF_DAY.clone().add(this.WORKDAY_MINS + 60, 'minutes');

  this.calculateIncomeBreakdown = function(income) {
    var info = {};

    info.income = income;

    // income tax
    info.incomeTax = self.incomeTax(info);
    // after tax income
    info.netIncome = income - info.incomeTax;

    // VAT calculated on net income
    info.vatTax = self.vatTax(info);

    // total personal tax
    info.personalTax = info.incomeTax + info.vatTax;
    // income after tax and VAT
    info.disposableIncome = income - info.personalTax;

    // fraction of day spent working for yourself
    info.personal_fraction = info.disposableIncome / info.income;
    // times spent working for yourself
    info.personal_minutes = info.personal_fraction * self.WORKDAY_MINS;
    // times spent working for the man
    info.taxman_minutes = self.WORKDAY_MINS - info.personal_minutes;
    // fraction of day spent working for the man
    info.taxman_fraction = 1 - info.personal_fraction;

    info.breakdown = this.doBreakdown(info);

    // time spent working for myself
    info.breakdown.push(this.workingForSelf(info));

    // sort
    info.breakdown = _.sortBy(info.breakdown, function(b) {
      return self.ORDERING[b.name] || -b.fraction;
    });

    // add times of day
    this.addTimesOfDay(info.breakdown);

    return info;
  };

  this.incomeTax = function(info) {
    var gross_income_tax = 0;
    var band = _.find(this.TAX_TABLE, function(b) {
      return (info.income >= b.threshold) && (info.income <= b.limit);
    });

    if (band) {
      gross_income_tax = band.baseAmount + (band.marginalRate * (info.income - band.threshold));
      gross_income_tax = gross_income_tax - this.PRIMARY_REBATE;
    }

    if (gross_income_tax < 0) gross_income_tax = 0;

    return gross_income_tax;
  };

  this.vatTax = function(info) {
    return info.netIncome * this.VAT / (1 + this.VAT);
  };

  this.workingForSelf = function(info) {
    return {
      name: 'Working for yourself',
      amount: info.income,
      taxpayer_amount: info.disposableIncome,
      fraction: info.personal_fraction,
      minutes: info.personal_minutes,
    };
  };

  this.doBreakdown = function(info) {
    return _.map(this.EXPENDITURE, function(amount, category) {
      // scale amount to that contributed by personal taxpayers
      var taxpayer_amount = self.TAXPAYER_RATIO * amount;
      var fraction = amount / self.CONSOLIDATED_EXPENDITURE * info.taxman_fraction;

      return {
        name: category,
        // absolute amount from budget
        amount: amount,
        // amount contributed by the taxpayer
        taxpayer_amount: taxpayer_amount,
        // fraction of time spent on this amount
        fraction: fraction,
        // minutes per day spent on this amount
        minutes: self.WORKDAY_MINS * fraction,
      };
    });
  };

  this.addTimesOfDay = function(cats) {
  	//let us have an hour long lunch from 13:00
  	var startlunch = this.START_OF_DAY.clone().add(5, 'hours');
  	
  	var endlunch = startlunch.clone().add(1, 'hours');
  	
    var time = this.START_OF_DAY;

    _.each(cats, function(cat) {
      // time of day when you FINISH working for this category
      	time = time.clone().add(cat.minutes, 'm');
      
      
      if (time.isAfter(endlunch)){
      	//if activity comes up after lunch hour, let's account for the one hour lunch break. 
      	time = time.clone().add(1, 'hours');
     	cat.finish_time = time.clone();
      	cat.finish_time_s = time.format('h:mm a');
      }else{
      	cat.finish_time = time.clone();
      	cat.finish_time_s = time.format('h:mm a');
      }
    });
  };
};
