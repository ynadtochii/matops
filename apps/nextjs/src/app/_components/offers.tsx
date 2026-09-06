export function Offers() {
  return (
    <section aria-labelledby="offers-title" className="flex flex-col gap-3">
      <h3
        id="offers-title"
        className="text-muted-foreground text-xs font-medium tracking-wider uppercase"
      >
        What it costs
      </h3>
      <dl className="flex flex-col gap-3 text-sm">
        <div>
          <dt className="font-medium">Academy</dt>
          <dd className="text-muted-foreground">
            One BJJ academy with everything in it: schedule, booking,
            attendance, members, belts and dues. Pilot academies use it free
            until a date we agree with them. After that we expect to charge
            around €49 a month.
          </dd>
        </div>
        <div>
          <dt className="font-medium">Facility</dt>
          <dd className="text-muted-foreground">
            For a gym that runs a mat and another bookable space, with one set
            of people and one membership across both. Not on sale. We will price
            it when that part works, and not before.
          </dd>
        </div>
      </dl>
    </section>
  );
}
